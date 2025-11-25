// FIX: Import `computed` from '@angular/core' to resolve the "Cannot find name 'computed'" error.
import { Component, ChangeDetectionStrategy, signal, computed, inject, ViewChild, ElementRef } from '@angular/core';
import { GeminiService, GradingResponse, ProficiencyChartData } from './gemini.service';

interface Level {
  id: string;
  name: string;
  description: string;
}

interface Topic {
  id: string;
  name: string;
}

interface TopicCategory {
  category: string;
  topics: Topic[];
}

interface DifficultyIteration {
  maskingPercentage: number;
}

interface Lesson {
  originalText: string;
  difficultyIterations: DifficultyIteration[];
}


@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  @ViewChild('editor') editor: ElementRef<HTMLDivElement> | undefined;

  private geminiService = inject(GeminiService);

  currentView = signal<'selection' | 'lesson'>('selection');
  isLoading = signal(false);
  isGeneratingLesson = signal(false);
  isGraded = signal(false);
  gradedContent = signal('');
  studyModalVisible = signal(false);

  // Lesson state
  currentDifficultyIndex = signal(0);
  lessonCompleted = signal(false);
  lesson = signal<Lesson | null>(null);
  userInputContent = signal('<p><br></p>');

  // Static data
  levels: Level[] = [
    { id: 'A1', name: 'A1', description: 'Beginner' },
    { id: 'A2', name: 'A2', description: 'Elementary' },
    { id: 'B1', name: 'B1', description: 'Intermediate' },
    { id: 'B2', name: 'B2', description: 'Upper-Int.' },
    { id: 'C1', name: 'C1', description: 'Advanced' },
    { id: 'C2', name: 'C2', description: 'Proficient' },
  ];

  topicData: TopicCategory[] = [
    {
      category: 'Business',
      topics: [
        { id: 'business-email', name: 'Email Communication' },
        { id: 'business-agendas', name: 'Meeting Agendas' },
        { id: 'business-proposals', name: 'Strategic Proposals' },
        { id: 'business-reports', name: 'Reports' },
      ],
    },
    {
      category: 'Academic',
      topics: [
        { id: 'academic-papers', name: 'Research Papers' },
        { id: 'academic-essays', name: 'Essays' },
        { id: 'academic-reviews', name: 'Literature Reviews' },
        { id: 'academic-grants', name: 'Grant Proposals' },
      ],
    },
  ];

  selectedLevel = signal('B1');
  selectedTopic = signal('business-proposals');

  lessonTitle = computed(() => {
    const topic = this.topicData
      .flatMap(cat => cat.topics)
      .find(t => t.id === this.selectedTopic());
    const category = this.topicData.find(cat => cat.topics.some(t => t.id === this.selectedTopic()));
    return topic && category ? `${category.category}: ${topic.name}` : 'Writing Lesson';
  });

  currentMaskingPercentage = computed(() => {
    const currentLesson = this.lesson();
    if (!currentLesson) return 0;
    return currentLesson.difficultyIterations[this.currentDifficultyIndex()].maskingPercentage
  });

  maskedReferenceText = computed(() => {
    const currentLesson = this.lesson();
    if (!currentLesson) return 'Loading lesson...';

    const percentage = this.currentMaskingPercentage();
    if (percentage === 0) return currentLesson.originalText;
    if (percentage === 100) return 'Reconstruct the full text from memory.';

    const words = currentLesson.originalText.split(' ');
    const maskEvery = Math.floor(100 / percentage);
    return words.map((word, index) => ((index + 1) % maskEvery === 0 ? '_____' : word)).join(' ');
  });

  feedbackData = signal<{
    score: number;
    strengths: string[];
    improvements: string[];
    proficiencyChartData: ProficiencyChartData;
  }>({
    score: 0,
    strengths: [],
    improvements: [],
    proficiencyChartData: {
      Formality: 0, Clarity: 0, Conciseness: 0, Grammar: 0, Vocabulary: 0
    }
  });

  radarChartPoints = computed(() => {
    const data = this.feedbackData().proficiencyChartData;
    const labels = ['Formality', 'Clarity', 'Conciseness', 'Grammar', 'Vocabulary'];
    const numAxes = labels.length;
    const size = 100;
    const center = size / 2;
    const radius = size * 0.4;
    const maxValue = 5;

    if (!data) return '';
    
    const points = labels.map((label, i) => {
      const value = data[label as keyof ProficiencyChartData] ?? 0;
      const angle = (Math.PI * 2 * i) / numAxes - Math.PI / 2;
      const x = center + radius * (value / maxValue) * Math.cos(angle);
      const y = center + radius * (value / maxValue) * Math.sin(angle);
      return `${x},${y}`;
    });

    return points.join(' ');
  });

  radarChartPolygons = computed(() => {
    const numAxes = 5;
    const size = 100;
    const center = size / 2;
    const radius = size * 0.4;
    const polygons: { points: string }[] = [];

    for (let i = 1; i <= 5; i++) {
        let points = '';
        const r = radius * (i / 5);
        for (let j = 0; j < numAxes; j++) {
            const angle = (Math.PI * 2 * j) / numAxes - Math.PI / 2;
            const x = center + r * Math.cos(angle);
            const y = center + r * Math.sin(angle);
            points += `${x},${y} `;
        }
        polygons.push({ points: points.trim() });
    }
    return polygons;
  });

  radarChartGrid = computed(() => {
    const labels = ['Formality', 'Clarity', 'Conciseness', 'Grammar', 'Vocabulary'];
    const numAxes = labels.length;
    const size = 100;
    const center = size / 2;
    const radius = size * 0.4;
    const gridItems = [];

    for (let i = 0; i < numAxes; i++) {
        const angle = (Math.PI * 2 * i) / numAxes - Math.PI / 2;
        gridItems.push({
            label: labels[i],
            line: {
                x1: center,
                y1: center,
                x2: center + radius * Math.cos(angle),
                y2: center + radius * Math.sin(angle)
            },
            labelPos: {
                x: center + (radius + 10) * Math.cos(angle),
                y: center + (radius + 10) * Math.sin(angle)
            }
        });
    }
    return gridItems;
  });

  async checkAnswers() {
    if (!this.editor || !this.lesson()) return;
    const userInput = this.editor.nativeElement.innerHTML;
    this.userInputContent.set(userInput);

    this.isLoading.set(true);
    this.isGraded.set(false);
    
    const originalText = this.lesson()!.originalText;
    const result = await this.geminiService.performSemanticGrading(originalText, userInput);
    
    this.feedbackData.set({
      score: result.score,
      strengths: result.feedback.strengths,
      improvements: result.feedback.improvements,
      proficiencyChartData: result.proficiencyChartData,
    });

    this.gradedContent.set(this.buildGradedHtml(result));

    if (result.score >= 80 && this.currentDifficultyIndex() === this.lesson()!.difficultyIterations.length - 1) {
      this.lessonCompleted.set(true);
    }
    
    this.isLoading.set(false);
    this.isGraded.set(true);
  }
  
  private buildGradedHtml(result: GradingResponse): string {
    // This is a simplified approach. A more robust solution would parse the HTML input
    // and replace words more accurately. This version reconstructs the HTML from the diffs.
    let html = '<p>';
    result.diffs.forEach(diff => {
      if (diff.word.includes('\n')) {
        html += `</p><p>${diff.word.replace('\n', '')} `;
      } else {
        if (diff.isCorrect) {
          html += `${diff.word} `;
        } else {
          html += `<span class="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded px-1" title="${diff.errorType}">${diff.word}</span> `;
        }
      }
    });
    return html + '</p>';
  }


  tryAgain(): void {
    this.isGraded.set(false);
    this.gradedContent.set('');
    this.resetFeedback();
  }

  nextLevel(): void {
    const currentLesson = this.lesson();
    if (currentLesson && this.currentDifficultyIndex() < currentLesson.difficultyIterations.length - 1) {
      this.currentDifficultyIndex.update(i => i + 1);
      this.isGraded.set(false);
      this.gradedContent.set('');
      this.resetFeedback();
      this.userInputContent.set('<p><br></p>');
    }
  }

  resetFeedback() {
    this.feedbackData.set({
      score: 0,
      strengths: [],
      improvements: [],
      proficiencyChartData: {
        Formality: 0, Clarity: 0, Conciseness: 0, Grammar: 0, Vocabulary: 0
      }
    });
  }

  getScoreDashOffset(): number {
    const score = this.feedbackData().score;
    const radius = 16;
    const circumference = 2 * Math.PI * radius;
    return circumference - (score / 100) * circumference;
  }

  async startLesson() {
    this.currentView.set('lesson');
    this.isGeneratingLesson.set(true);
    // Reset all states
    this.isGraded.set(false);
    this.lessonCompleted.set(false);
    this.currentDifficultyIndex.set(0);
    this.gradedContent.set('');
    this.resetFeedback();
    this.lesson.set(null);
    this.userInputContent.set('<p><br></p>');

    const generatedText = await this.geminiService.generateSample(this.selectedLevel(), this.selectedTopic());
    
    this.lesson.set({
      originalText: generatedText,
      difficultyIterations: [
        { maskingPercentage: 20 },
        { maskingPercentage: 50 },
        { maskingPercentage: 100 },
      ]
    });
    this.isGeneratingLesson.set(false);
    this.studyModalVisible.set(true);
  }

  startWriting(): void {
    this.studyModalVisible.set(false);
  }

  backToSelection() {
    this.currentView.set('selection');
    this.studyModalVisible.set(false);
  }

  onLevelChange(levelId: string) {
    this.selectedLevel.set(levelId);
  }

  onTopicChange(topicId: string) {
    this.selectedTopic.set(topicId);
  }
}