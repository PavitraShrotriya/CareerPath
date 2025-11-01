// require('dotenv').config();
// const express = require('express');
// const { GoogleGenerativeAI } = require('@google/generative-ai');
// const cors = require('cors');
// const path = require('path');

// const app = express();
// app.use(express.json());
// app.use(cors());



require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(cors());

// const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

// User Schema
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  testHistory: [{
    date: Date,
    results: Object,
    suggestions: Array
  }]
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

const User = mongoose.model('User', UserSchema);

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Authentication Middleware
const authMiddleware = async (req, res, next) => {
  const token = req.header('x-auth-token');
  if (!token) return res.status(401).json({ msg: 'No token, authorization denied' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.user.id).select('-password');
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token is not valid' });
  }
};

// Routes
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'User already exists' });

    user = new User({ name, email, password });
    await user.save();

    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5h' }, (err, token) => {
      if (err) throw err;
      res.json({ token });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });

    const payload = { user: { id: user.id } };
    jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '5h' }, (err, token) => {
      if (err) throw err;
      res.json({ token });
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Protected route example
app.get('/api/user/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

app.post('/generate-questions', async (req, res) => {
    try {
        const { currentStatus, currentField, interestField } = req.body;
        const prompt = `Generate 10 unique career quidance aptitude test questions tailored for a person with the following details:
            - Current stage: ${currentStatus}
            - Current Field: ${currentField}
            - Area of Interest: ${interestField}

            The questions should evaluate the user's skills, problem-solving ability, personality traits, and work preferences related to career paths and should evaluate if the person is actually suited for his current field or field of interest.

            Return the questions in JSON array format with:
            - "question": The question as a string
            - "options": An array of 4 answer choices
            - "category": The aspect being evaluated (e.g., Skills, Personality, Problem-Solving, Work Preferences).`;


        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        
        const textResponse = result.response.candidates[0].content.parts[0].text; // Corrected API response handling
        const cleanJson = textResponse.replace(/```json|```/g, '').trim(); // Remove Markdown if present
        const questions = JSON.parse(cleanJson);

        res.json(questions);
    } catch (error) {
        console.error('Error generating questions:', error);
        res.status(500).json({ error: 'Failed to generate questions.' });
    }
});

app.post('/analyze-results', async (req, res) => {
    try {
        const { results } = req.body;
        const prompt = `Based on the following aptitude test results, provide a brief career recommendation in 2-3 sentences. Focus on the most suitable career path without listing individual responses.

            Details:
            - Current Status: ${results.currentStatus}
            - Current Field: ${results.currentField}
            - Field(s) of Interest: ${results.interestField}
            - Responses: ${JSON.stringify(results)}
            
            Keep the response concise, practical, and actionable. It should provide a guidance and should show the truth and also some other options based on field of interest and current field`;
        
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });

        const analysis = result.response.candidates[0].content.parts[0].text;

        res.json({ analysis });

        const user = await User.findById(req.user.id);
        user.testHistory.push({
            date: new Date(),
            results: req.body.results,
        });
        await user.save();
    } catch (error) {
        console.error('Error analyzing results:', error);
        res.status(500).json({ error: 'Failed to analyze results.' });
    }
});

app.post('/career-suggestions', async (req, res) => {
    try {
        const userProfile = req.body;
        const prompt = `Analyze this profile and suggest 5 career paths:
        Skills: ${userProfile.skills}
        Interests: ${userProfile.interests}
        Experience: ${userProfile.experience}
        Return as JSON array with fields: career_title, growth_outlook, required_skills`;

        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });

        const textResponse = result.response.candidates[0].content.parts[0].text;
        const cleanJson = textResponse.replace(/```json|```/g, '').replace(/```/g, '').trim();
        const analysis = JSON.parse(cleanJson);

        res.json({ analysis });
    } catch (error) {
        console.error('Error generating career suggestions:', error);
        res.status(500)
        res.json({ error: 'Failed to generate career suggestions.' });
        }
});

// Endpoint to handle chatbot messages for career guidance
app.post('/career-chat', async (req, res) => {
  try {
    const userMessage = req.body.message;

    // Prompt Gemini to respond strictly within the domain of career guidance
    const prompt = `
You are a career guidance assistant. Only answer questions related to careers, studies, skills, jobs, and professional development.

User: ${userMessage}

Provide a clear, concise, and helpful response in 2-3 sentences.
`;

    // Use Gemini model (adjust 'gemini-2.5-flash' if you're using a different version)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ]
    });

    const answer = result.response.candidates[0].content.parts[0].text;

    res.json({ answer });

  } catch (error) {
    console.error('Error in /career-chat endpoint:', error);
    res.status(500).json({ error: 'Failed to generate chat response.' });
  }
});

const port = 3000;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

