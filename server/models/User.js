/**
 * models/User.js — college users. One model, three roles (single auth system).
 *
 * ROLE MODEL (usage levels — see README "Roles")
 * - 'user'    → authenticated student: profile + public features (search/chat)
 * - 'creator' → content creator: FAQ CRUD on OWN FAQs + AI draft generation
 * - 'admin'   → full management authority (users, categories, any FAQ, review)
 * Unauthenticated visitors are the PUBLIC level — no database role needed.
 *
 * KEY POINTS
 * - `password` stores ONLY the bcrypt hash (never a plain password) and has
 *   `select: false`, so queries never leak it unless we explicitly ask.
 * - `role` drives authorization. Authorization ALWAYS uses the fresh DB value
 *   (requireAuth reloads the user), never a stale role claim inside the JWT.
 * - email is lowercased and unique — MongoDB enforces it with an index.
 * - toSafeJSON() is the ONLY way we send users out of the API: it strips the
 *   password hash, so it can never leak even if a controller forgets.
 */
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [60, 'Name must be at most 60 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Email format is invalid'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // never returned by queries unless .select('+password')
    },
    role: {
      type: String,
      enum: {
        values: ['user', 'creator', 'admin'],
        message: 'Role must be "user", "creator" or "admin"',
      },
      default: 'user',
    },
  },
  { timestamps: true }
);

/** Returns the user without the password hash — use for ALL API responses. */
userSchema.methods.toSafeJSON = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const User = mongoose.model('User', userSchema);
