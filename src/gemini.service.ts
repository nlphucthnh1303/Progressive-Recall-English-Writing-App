import { Injectable } from '@angular/core';
import { GoogleGenAI, Type } from '@google/genai';

export interface ProficiencyChartData {
  Formality: number;
  Clarity: number;
  Conciseness: number;
  Grammar: number;
  Vocabulary: number;
}

export interface GradingResponse {
  score: number;
  feedback: {
    strengths: string[];
    improvements: string[];
  };
  diffs: {
    word: string;
    isCorrect: boolean;
    errorType: string;
  }[];
  proficiencyChartData: ProficiencyChartData;
}


@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    // IMPORTANT: In a real application, the API key should be handled securely
    // and not exposed in the client-side code. This is for demonstration purposes only.
    if (!process.env.API_KEY) {
      throw new Error("API_KEY environment variable not set");
    }
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async generateSample(level: string, topic: string): Promise<string> {
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `You are an English curriculum designer. Generate a short, professional paragraph (2-4 sentences) for an English writing exercise. The proficiency Level is '${level}' and the topic is '${topic}'. The paragraph must be a realistic example of the topic. It must include at least two relevant collocations or idiomatic phrases. The grammar and vocabulary must be appropriate for the specified proficiency level. Return ONLY the generated paragraph as a plain string, with no formatting or titles.`,
      });
      return response.text.trim();
    } catch (error) {
      console.error('Error generating sample text:', error);
      return 'Error: Could not generate a lesson. Please try again.';
    }
  }

  async performSemanticGrading(originalText: string, userInput: string): Promise<GradingResponse> {
    const gradingSchema = {
      type: Type.OBJECT,
      properties: {
        score: { type: Type.INTEGER, description: 'Overall score from 0-100.' },
        feedback: {
          type: Type.OBJECT,
          properties: {
            strengths: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Two concise points on what the user did well.' },
            improvements: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Two concise points for the user to improve.' },
          },
          required: ['strengths', 'improvements']
        },
        diffs: {
          type: Type.ARRAY,
          description: "An array of objects for EVERY word from the user's input. If a word is incorrect, provide a brief 'errorType' explaining the mistake.",
          items: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              isCorrect: { type: Type.BOOLEAN },
              errorType: { type: Type.STRING, description: "E.g., 'Grammar: Tense mismatch', 'Vocabulary: Incorrect word choice', 'Style: Too informal'. Is an empty string if isCorrect is true." },
            },
            required: ['word', 'isCorrect', 'errorType']
          }
        },
        proficiencyChartData: {
          type: Type.OBJECT,
          description: "Scores for five core writing attributes on a scale of 1 (poor) to 5 (excellent).",
          properties: {
            Formality: { type: Type.NUMBER },
            Clarity: { type: Type.NUMBER },
            Conciseness: { type: Type.NUMBER },
            Grammar: { type: Type.NUMBER },
            Vocabulary: { type: Type.NUMBER },
          },
          required: ['Formality', 'Clarity', 'Conciseness', 'Grammar', 'Vocabulary']
        }
      },
      required: ['score', 'feedback', 'diffs', 'proficiencyChartData']
    };

    const prompt = `You are an expert English writing teacher. Your task is to perform a semantic comparison of two texts. The 'Original Text' is the correct version. The 'User Input' is the student's attempt to reconstruct it.

**Original Text:**
\`\`\`
${originalText}
\`\`\`

**User Input (as HTML):**
\`\`\`html
${userInput}
\`\`\`

Analyze the 'User Input' against the 'Original Text'. Your analysis should focus on:
1.  **Semantic Accuracy**: Does the user's text convey the same meaning?
2.  **Grammatical Correctness**: Are there any grammatical errors?
3.  **Vocabulary & Style**: Is the word choice and formality appropriate and similar to the original?
4.  **Proficiency Attributes**: Rate the user's text on a scale of 1 (poor) to 5 (excellent) for Formality, Clarity, Conciseness, Grammar, and Vocabulary.

Return your analysis ONLY in the specified JSON format. The \`diffs\` array should contain an object for each word from the 'User Input'.`;

    try {
        const response = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: gradingSchema,
            },
        });
        
        const jsonString = response.text;
        const parsedResponse = JSON.parse(jsonString);
        
        // Basic validation
        if (parsedResponse.score === undefined || !parsedResponse.feedback || !parsedResponse.diffs || !parsedResponse.proficiencyChartData) {
            throw new Error("Invalid response structure from AI");
        }

        return parsedResponse as GradingResponse;
    } catch (error) {
        console.error('Error performing semantic grading:', error);
        // Provide a fallback error response that matches the expected structure
        return {
            score: 0,
            feedback: {
                strengths: [],
                improvements: ['There was an error grading your response. Please try again.'],
            },
            diffs: [{ word: 'Error processing response.', isCorrect: false, errorType: 'API_ERROR' }],
            proficiencyChartData: {
              Formality: 0, Clarity: 0, Conciseness: 0, Grammar: 0, Vocabulary: 0
            }
        };
    }
  }
}