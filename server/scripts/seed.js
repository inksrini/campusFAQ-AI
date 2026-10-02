/**
 * scripts/seed.js — fills the database with realistic sample data.
 *
 * RUN:  npm run seed        (or: node server/scripts/seed.js)
 *
 * WHAT IT DOES (repeatable — wipes the 4 collections every run):
 * 1. Connects to MongoDB Atlas.
 * 2. Creates 3 DEMO accounts (development/demo credentials — do NOT reuse):
 *    admin@campus.ai    / Admin@12345     (admin)
 *    creator@campus.ai  / Creator@12345   (creator — content creator role)
 *    student@campus.ai  / Student@12345   (user)
 *    (public users need no account)
 * 3. Creates the 10 standard categories.
 * 4. Inserts ~30 realistic college FAQs.
 * 5. Generates a Gemini embedding for EVERY FAQ (small delays to respect
 *    free-tier rate limits) and stores it on the document, so Atlas Vector
 *    Search works immediately after seeding.
 *
 * NOTE: run this BEFORE creating the Atlas Vector Search index — the index
 * builds over the existing collection. (See README, "Vector Search setup".)
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Category } from '../models/Category.js';
import { FAQ } from '../models/FAQ.js';
import { UnansweredQuestion } from '../models/UnansweredQuestion.js';
import { embedDocument } from '../services/embeddingService.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CATEGORIES = [
  { name: 'Admissions', description: 'Application process, eligibility and documents' },
  { name: 'Fees', description: 'Tuition, exam fees, payment deadlines' },
  { name: 'Courses', description: 'Programs offered and structure' },
  { name: 'Examinations', description: 'Exam schedules, results, revaluation' },
  { name: 'Library', description: 'Timings, borrowing rules, digital resources' },
  { name: 'Hostel', description: 'Accommodation, facilities and rules' },
  { name: 'Transport', description: 'Bus routes and transport fees' },
  { name: 'Placements', description: 'Training and placement cell' },
  { name: 'Scholarships', description: 'Merit and need-based financial aid' },
  { name: 'General', description: 'Everything else' },
];

/** question/answer pairs; some are deliberately paraphrase-friendly for search demos. */
const FAQS = {
  Admissions: [
    {
      question: 'How do I apply for the BCA program?',
      answer:
        'Apply online through the college admissions portal. Fill in the application form, upload your mark sheets and ID proof, pay the application fee, and attend the counselling round if shortlisted. Applications usually open in May each year.',
    },
    {
      question: 'What documents are required for admission?',
      answer:
        'You need your 10th and 12th mark sheets, transfer certificate, migration certificate (if applicable), caste or income certificates (if applying for reservations or scholarships), Aadhaar card, and recent passport-size photographs.',
    },
    {
      question: 'Is there a management quota for admission?',
      answer:
        'Yes, a small number of seats are filled under the management quota. Contact the admissions office directly for eligibility criteria and fee structure, as these seats are limited and filled on a first-come basis.',
    },
  ],
  Fees: [
    {
      question: 'When are exam fees due each semester?',
      answer:
        'Exam fees are typically collected four weeks before the semester-end examinations. The exact dates are announced on the notice board and the student portal. A late fee applies for payments after the deadline.',
    },
    {
      question: 'What are the tuition fee payment methods?',
      answer:
        'Tuition fees can be paid online through the student portal using UPI, debit card, net banking, or in person at the college accounts office via demand draft. Instalment options are available for eligible students.',
    },
    {
      question: 'Is there a fee instalment option?',
      answer:
        'Yes. Students may pay tuition in two instalments per academic year: 60% at the start of the first semester and 40% at the start of the second. A written request to the accounts office is required.',
    },
  ],
  Courses: [
    {
      question: 'Which undergraduate courses does the college offer?',
      answer:
        'The college offers BCA, BBA, B.Com, B.Sc (Computer Science, Electronics, Mathematics) and BA (English, Economics). Each program follows the university curriculum with three-year and four-year (honours) options.',
    },
    {
      question: 'Can I change my course after admission?',
      answer:
        'Course changes are possible only within the first two weeks of the semester, subject to seat availability and eligibility. Submit a written application to the academic office; approvals typically take three working days.',
    },
    {
      question: 'Are there any certificate courses available?',
      answer:
        'Yes, the college runs add-on certificate courses in Web Development, Data Analytics, Spoken English and Tally. They are conducted after regular class hours and cost a nominal additional fee.',
    },
  ],
  Examinations: [
    {
      question: 'When are the semester exam results declared?',
      answer:
        'Results are usually declared within 30 days of the last examination. They are published on the university results portal; you need your roll number to view them. Revaluation applications open one week after results.',
    },
    {
      question: 'How do I apply for revaluation of an answer sheet?',
      answer:
        'Submit the revaluation application through the student portal within 10 days of result declaration, paying the prescribed fee per subject. Revaluation can raise or lower your marks; the revised result is final.',
    },
    {
      question: 'What is the minimum attendance required to write exams?',
      answer:
        'A minimum of 75% attendance per course is required to be eligible for semester-end examinations. Students with 65-75% may be condoned by the principal for valid reasons such as medical emergencies.',
    },
  ],
  Library: [
    {
      question: 'What are the library working hours?',
      answer:
        'The library is open from 9 AM to 6 PM on all working days (Monday to Saturday). During examination periods, the reading hall stays open until 8 PM.',
    },
    {
      question: 'How many books can I borrow from the library?',
      answer:
        'Undergraduate students can borrow up to 3 books for 14 days. Postgraduate students can borrow 5 books for 21 days. Late returns attract a fine of 2 rupees per book per day.',
    },
    {
      question: 'Does the library have digital resources or e-books?',
      answer:
        'Yes, the library provides access to the DELNET and N-LIST digital databases, which include thousands of e-books and journals. Access is available on campus through the library portal using your student login.',
    },
    {
      question: 'Can I access the library in the evening for reading?',
      answer:
        'The main library closes at 6 PM, but the dedicated reading hall remains open until 8 PM during examination months. The reading hall allows personal books and study materials.',
    },
  ],
  Hostel: [
    {
      question: 'Is hostel accommodation available for students?',
      answer:
        'Yes, separate hostels are available for male and female students with a total capacity of 400 beds. Accommodation is allotted on merit and distance from the college; apply through the hostel office at the start of the academic year.',
    },
    {
      question: 'What are the hostel fees per year?',
      answer:
        'Hostel fees are approximately 65,000 rupees per academic year, covering lodging, meals, and electricity. A refundable caution deposit of 5,000 rupees is collected once at admission.',
    },
    {
      question: 'What items am I allowed to bring to the hostel?',
      answer:
        'Students may bring personal clothing, study materials, a laptop, and small appliances like an electric kettle. Induction cookers, heaters, and other high-wattage appliances are strictly prohibited for safety.',
    },
  ],
  Transport: [
    {
      question: 'Which areas do the college buses cover?',
      answer:
        'College buses operate on 12 routes covering the city and nearby suburbs. Route maps are published on the transport notice board each semester. Routes may be adjusted based on student demand.',
    },
    {
      question: 'How much is the transport fee per semester?',
      answer:
        'Transport fees range from 8,000 to 12,000 rupees per semester depending on the route distance. Fees are payable at the start of each semester along with tuition or in the transport office.',
    },
  ],
  Placements: [
    {
      question: 'When am I eligible for campus placements?',
      answer:
        'Students become eligible for campus placements from the fifth semester onwards, provided they maintain at least 65% aggregate marks and meet the attendance requirement. Specific companies may set higher criteria.',
    },
    {
      question: 'Which companies have visited the campus recently?',
      answer:
        'Recent recruiters include Infosys, TCS, Wipro, Capgemini, and several regional IT and finance firms. The placement cell publishes the year-wise placement record on the college website.',
    },
    {
      question: 'Does the college provide placement training?',
      answer:
        'Yes, the Training and Placement Cell conducts free sessions on aptitude, group discussions, technical interview skills and resume building every semester, plus mock interviews before recruitment season.',
    },
  ],
  Scholarships: [
    {
      question: 'What scholarships are available for students?',
      answer:
        'Available scholarships include the government post-matric scholarship, the college merit scholarship (top 10% of each program), and need-based fee waivers for family income below 2.5 lakh rupees per year.',
    },
    {
      question: 'How do I apply for a merit scholarship?',
      answer:
        'Merit scholarship applications open in the second month of each academic year. Collect the form from the scholarship office or download it from the student portal, and submit it with your previous semester mark sheet.',
    },
  ],
  General: [
    {
      question: 'What are the college office timings?',
      answer:
        'The administrative office is open from 9:30 AM to 4:30 PM on working days. Certificate issuance and fee payments are handled until 4 PM, so plan visits accordingly.',
    },
    {
      question: 'How do I get a bonafide certificate?',
      answer:
        'Apply through the student portal or the academic office. Bonafide certificates are usually issued within two working days. State the purpose (e.g. bank loan, passport) on the application.',
    },
    {
      question: 'Is Wi-Fi available on campus?',
      answer:
        'Yes, free Wi-Fi is available in the library, computer labs and the main academic block. Connect using your student ID and portal password; each account gets a 5 GB daily data limit.',
    },
  ],
};

async function main() {
  await connectDB();

  console.log('[seed] Clearing existing data (users, categories, faqs, unansweredquestions)...');
  await Promise.all([
    User.deleteMany({}),
    Category.deleteMany({}),
    FAQ.deleteMany({}),
    UnansweredQuestion.deleteMany({}),
  ]);

  console.log('[seed] Creating DEMO accounts (development credentials only)...');
  const hash = (pw) => bcrypt.hash(pw, env.bcryptSaltRounds);
  const admin = await User.create({
    name: 'Campus Admin',
    email: 'admin@campus.ai',
    password: await hash('Admin@12345'),
    role: 'admin',
  });
  const creator = await User.create({
    name: 'Content Creator',
    email: 'creator@campus.ai',
    password: await hash('Creator@12345'),
    role: 'creator',
  });
  const student = await User.create({
    name: 'Sample Student',
    email: 'student@campus.ai',
    password: await hash('Student@12345'),
    role: 'user',
  });
  console.log(`  admin:   admin@campus.ai / Admin@12345     (${admin._id})`);
  console.log(`  creator: creator@campus.ai / Creator@12345   (${creator._id})`);
  console.log(`  user:    student@campus.ai / Student@12345   (${student._id})`);

  console.log('[seed] Creating categories...');
  const categoryDocs = await Category.insertMany(
    CATEGORIES.map((c) => ({ ...c }))
  );
  const categoryByName = new Map(categoryDocs.map((c) => [c.name, c]));

  const total = Object.values(FAQS).reduce((n, list) => n + list.length, 0);
  let done = 0;
  console.log(`[seed] Creating and embedding ${total} FAQs (one Gemini call each)...`);

  for (const [categoryName, faqList] of Object.entries(FAQS)) {
    const category = categoryByName.get(categoryName);
    for (const { question, answer } of faqList) {
      try {
        const embedding = await embedDocument(`Q: ${question}\nA: ${answer}`);
        await FAQ.create({
          question,
          answer,
          category: category._id,
          embedding,
          embeddingModel: env.geminiEmbeddingModel,
          embeddingUpdatedAt: new Date(),
          createdBy: admin._id, // seeded FAQs belong to the admin demo account
        });
      } catch (err) {
        console.error(`  FAILED to embed FAQ "${question}": ${err.message}`);
        process.exitCode = 1;
        continue; // keep going so partial seeds are still usable
      }
      done += 1;
      console.log(`  [${done}/${total}] ${categoryName}: ${question}`);
      await sleep(300); // stay comfortably within free-tier rate limits
    }
  }

  console.log('\n[seed] Done. Next steps:');
  console.log('  1. Create the Atlas Vector Search index (README → Vector Search setup).');
  console.log(`  2. Test retrieval: node server/scripts/testSearch.js "when does the library close"`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
