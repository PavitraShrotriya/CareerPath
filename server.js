require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/generate-questions', async (req, res) => {
    try {
        const { currentField, interestField } = req.body;
        const prompt = `Generate 10 unique career quidance aptitude test questions tailored for a person with the following details:
            - Current Field: ${currentField}
            - Field of Interest: ${interestField}

            The questions should evaluate the user's skills, problem-solving ability, personality traits, and work preferences related to career paths and should evaluate if the person is actually suited for his current field or field of interest.

            Return the questions in JSON array format with:
            - "question": The question as a string
            - "options": An array of 4 answer choices
            - "category": The aspect being evaluated (e.g., Skills, Personality, Problem-Solving, Work Preferences).`;


        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
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
        
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });

        const analysis = result.response.candidates[0].content.parts[0].text;

        res.json({ analysis });
    } catch (error) {
        console.error('Error analyzing results:', error);
        res.status(500).json({ error: 'Failed to analyze results.' });
    }
});

const port = 3000;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});