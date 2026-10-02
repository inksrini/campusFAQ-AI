/**
 * scripts/testSearch.js — test semantic search INDEPENDENTLY of answer generation.
 *
 * RUN:
 *   node server/scripts/testSearch.js "can I use the library at 5 in the evening"
 *   node server/scripts/testSearch.js "how do I get into BCA" --all
 *
 * WHAT IT DOES
 * 1. Embeds your question (Gemini embedding model).
 * 2. Runs the exact same $vectorSearch pipeline the API uses.
 * 3. Prints every matched FAQ with its similarity score.
 *
 * Use --all to show results WITHOUT the threshold filter — this reveals the
 * raw score distribution, which is how you tune SIMILARITY_THRESHOLD in .env:
 * pick a value between "related question" scores and "unrelated" scores.
 * NO Gemini answer generation happens here (a Phase 1 requirement).
 */
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { searchFaqs } from '../services/searchService.js';
import { env } from '../config/env.js';

async function main() {
  const args = process.argv.slice(2);
  const showAll = args.includes('--all');
  const question = args.filter((a) => a !== '--all').join(' ').trim();

  if (question.length < 5) {
    console.error('Usage: node server/scripts/testSearch.js "<question>" [--all]');
    process.exit(1);
  }

  await connectDB();

  console.log(`Question: "${question}"`);
  console.log(`Embedding model: ${env.geminiEmbeddingModel} (${env.embeddingDimensions} dims)`);
  console.log(
    showAll
      ? 'Showing ALL matches (no threshold filter) for tuning:'
      : `Threshold filter ON (>= ${env.similarityThreshold}):`
  );
  console.log('─'.repeat(72));

  const { matches } = await searchFaqs(question, { applyThreshold: !showAll });

  if (matches.length === 0) {
    console.log('No matches. (Is the Atlas Vector Search index created and ACTIVE?)');
  }
  for (const m of matches) {
    const score = Number(m.score.toFixed(4));
    const flag = score >= env.similarityThreshold ? 'PASS' : 'DROP';
    console.log(`score ${score.toFixed(4)} [${flag}] (${m.categoryName}) ${m.question}`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[testSearch] failed:', err.message);
  process.exit(1);
});
