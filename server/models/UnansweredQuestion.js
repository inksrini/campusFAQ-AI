/**
 * models/UnansweredQuestion.js — the fallback log.
 *
 * WHEN A ROW IS CREATED
 * When semantic search finds nothing above the similarity threshold, we do
 * NOT invent an answer. We return the safe fallback line AND log the question
 * here so an admin can later review it and turn it into a real FAQ.
 *
 * askedBy is optional: search/chat are public, so anonymous askers are stored
 * as null (filled when the request carried a valid JWT).
 */
import mongoose from 'mongoose';

const unansweredQuestionSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: [true, 'Question is required'],
      trim: true,
      minlength: [5, 'Question must be at least 5 characters'],
      maxlength: [500, 'Question was truncated at 500 characters'],
    },
    askedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    topScore: { type: Number, default: null }, // best similarity score seen — threshold tuning data
    status: {
      type: String,
      enum: { values: ['open', 'resolved', 'dismissed'], message: 'Invalid status' },
      default: 'open',
    },
  },
  { timestamps: true }
);

unansweredQuestionSchema.index({ status: 1, createdAt: -1 }); // admin list: newest open first

export const UnansweredQuestion = mongoose.model('UnansweredQuestion', unansweredQuestionSchema);
