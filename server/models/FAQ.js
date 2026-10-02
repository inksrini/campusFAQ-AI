/**
 * models/FAQ.js — one entry of the college knowledge base.
 *
 * THE EMBEDDING FIELD
 * `embedding` holds the Gemini vector for this FAQ's text. It is the field
 * covered by the MongoDB Atlas Vector Search index (created manually in the
 * Atlas UI — see README). When question/answer changes, the controller
 * regenerates the vector and bumps embeddingUpdatedAt so search never drifts.
 *
 * A custom validator enforces that every stored vector has EXACTLY
 * EMBEDDING_DIMENSIONS values (the same number the Atlas index is configured
 * with) and that they are finite numbers — a wrong-length vector would make
 * every $vectorSearch query fail, so it must never reach the database.
 *
 * NOTE: list endpoints exclude this field with .select('-embedding') — a few
 * hundred floats per FAQ would needlessly bloat every response.
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';

const faqSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: [true, 'Question is required'],
      trim: true,
      minlength: [5, 'Question must be at least 5 characters'],
      maxlength: [500, 'Question must be at most 500 characters'],
    },
    answer: {
      type: String,
      required: [true, 'Answer is required'],
      trim: true,
      minlength: [10, 'Answer must be at least 10 characters'],
      maxlength: [5000, 'Answer must be at most 5000 characters'],
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
    },
    embedding: {
      type: [Number],
      required: true,
      validate: {
        validator: (values) =>
          Array.isArray(values) &&
          values.length === env.embeddingDimensions &&
          values.every((v) => Number.isFinite(v)),
        // {VALUE} is a Mongoose placeholder → replaced with the actual array
        message: `Embedding must contain exactly ${env.embeddingDimensions} finite numbers`,
      },
    },
    embeddingModel: { type: String, default: '' },
    embeddingUpdatedAt: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

faqSchema.index({ category: 1 }); // fast "list FAQs in category X" queries

/** Text sent to the embedding model for this FAQ. */
faqSchema.methods.embeddingText = function () {
  return `Q: ${this.question}\nA: ${this.answer}`;
};

export const FAQ = mongoose.model('FAQ', faqSchema);
