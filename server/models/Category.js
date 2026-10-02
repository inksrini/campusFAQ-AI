/**
 * models/Category.js — FAQ groupings (Admissions, Fees, Library, ...).
 *
 * WHY A SEPARATE COLLECTION
 * FAQs reference a category by ObjectId. That reference is what makes
 * "invalid category" impossible to fake (we check existence) and lets the
 * browse UI list groups. Names are unique so we never get "Library" twice.
 */
import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true,
      trim: true,
      minlength: [2, 'Category name must be at least 2 characters'],
      maxlength: [50, 'Category name must be at most 50 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, 'Description must be at most 200 characters'],
      default: '',
    },
  },
  { timestamps: true }
);

export const Category = mongoose.model('Category', categorySchema);
