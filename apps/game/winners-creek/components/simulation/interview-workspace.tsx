"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Mic,
  Square,
  Play,
  Volume2,
  VolumeX,
  CheckCircle,
} from "@/components/ui/icons";
import { formatDuration, cn } from "@/lib/utils";
import type { InterviewAnswerEvaluation } from "@/lib/ai/types";

interface QuestionRecord {
  id: string;
  orderIndex: number;
  questionText: string;
  category: string;
  isFollowUp?: boolean;
  contextNotes?: string;
}

interface InterviewSessionData {
  session: { id: string; title: string; evaluationMode: string };
  interview: {
    id: string;
    role: string;
    seniority: string;
    track: string;
    targetDurationSeconds: number;
  };
  questions: QuestionRecord[];
}

export function InterviewWorkspace({ data }: { data: InterviewSessionData }) {
  const router = useRouter();
  const { session, interview, questions: initialQuestions } = data;

  const [questions, setQuestions] = useState<QuestionRecord[]>(initialQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [speakingAi, setSpeakingAi] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [, setEvaluations] = useState<InterviewAnswerEvaluation[]>([]);
  const [currentFeedback, setCurrentFeedback] = useState<InterviewAnswerEvaluation | null>(null);
  const [completing, setCompleting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const currentQuestion = questions[currentIndex];

  // Timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Text-To-Speech for AI Questions
  useEffect(() => {
    if (!currentQuestion || !ttsEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentQuestion.questionText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onstart = () => setSpeakingAi(true);
    utterance.onend = () => setSpeakingAi(false);
    utterance.onerror = () => setSpeakingAi(false);
    window.speechSynthesis.speak(utterance);

    return () => {
      window.speechSynthesis.cancel();
    };
  }, [currentIndex, currentQuestion, ttsEnabled]);

  // Microphone audio meter
  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((s) => {
        stream = s;
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(s);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const check = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length;
          setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
          animFrameRef.current = requestAnimationFrame(check);
        };
        check();
      })
      .catch((err) => {
        console.warn("Microphone meter unavailable:", err);
      });

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close().catch(() => {});
      }
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function startRecording() {
    setTranscript("");
    setCurrentFeedback(null);
    setIsRecording(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let chunk = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          chunk += event.results[i][0].transcript + " ";
        }
        setTranscript((prev) => `${prev} ${chunk}`.trim());
      };

      recognition.onerror = () => {};
      recognition.start();
      recognitionRef.current = recognition;
    }
  }

  async function submitAnswer() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
    setEvaluating(true);

    try {
      const res = await fetch(`/api/simulation/interview/${session.id}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          answerTranscript: transcript || "No spoken answer detected.",
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const evalItem: InterviewAnswerEvaluation = data.evaluation;
        setCurrentFeedback(evalItem);
        setEvaluations((prev) => [...prev, evalItem]);

        // If adaptive follow-up was generated, refresh questions list
        if (evalItem.adaptiveFollowUpQuestion) {
          const detailRes = await fetch(`/api/simulation/interview/${session.id}`);
          if (detailRes.ok) {
            const detail = await detailRes.json();
            setQuestions(detail.questions);
          }
        }
      }
    } catch (err) {
      console.error("Answer submission error:", err);
    } finally {
      setEvaluating(false);
    }
  }

  function handleNextQuestion() {
    setCurrentFeedback(null);
    setTranscript("");
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((i) => i + 1);
    } else {
      handleCompleteInterview();
    }
  }

  async function handleCompleteInterview() {
    setCompleting(true);
    try {
      const res = await fetch(`/api/simulation/interview/${session.id}/complete`, {
        method: "POST",
      });
      if (res.ok) {
        router.push(`/simulation/interview/results/${session.id}`);
      } else {
        router.push("/simulation/interview");
      }
    } catch {
      router.push("/simulation/interview");
    }
  }

  return (
    <div className="flex flex-col h-screen bg-surface-0 overflow-hidden">
      {/* Top Header */}
      <header className="h-14 border-b border-border-default px-6 flex items-center justify-between bg-surface-1 shrink-0">
        <div className="flex items-center gap-3">
          <Badge tone="neutral" className="uppercase font-mono text-xs">
            {interview.seniority} {interview.role}
          </Badge>
          <span className="text-xs text-ink-tertiary">|</span>
          <span className="text-xs text-ink-secondary">{interview.track} Track</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-mono text-ink-secondary bg-surface-2 px-2.5 py-1 rounded-full border border-border-subtle">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            {formatDuration(elapsedSeconds)}
          </div>
          <button
            onClick={() => setTtsEnabled((prev) => !prev)}
            className="p-1.5 rounded-md hover:bg-surface-2 text-ink-secondary transition-colors"
            title={ttsEnabled ? "Mute AI Voice" : "Enable AI Voice"}
          >
            {ttsEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4 text-ink-tertiary" />}
          </button>
          <Button variant="danger" size="sm" onClick={handleCompleteInterview} disabled={completing}>
            End Interview
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_420px] overflow-hidden">
        {/* Left Column: AI Interviewer & Candidate Audio */}
        <div className="flex flex-col p-6 overflow-y-auto gap-6 justify-between">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider font-semibold text-ink-tertiary">
                Question {currentIndex + 1} of {questions.length}
              </span>
              <div className="flex items-center gap-2">
                {currentQuestion.isFollowUp && (
                  <Badge tone="warning" className="text-[10px]">Adaptive Follow-Up</Badge>
                )}
                <Badge tone="neutral" className="text-[10px] uppercase">
                  {currentQuestion.category}
                </Badge>
              </div>
            </div>

            {/* Question Card */}
            <Card className="border-border-default shadow-sm bg-surface-1">
              <CardContent className="p-6 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "h-2.5 w-2.5 rounded-full",
                    speakingAi ? "bg-accent-500 animate-ping" : "bg-emerald-500"
                  )} />
                  <span className="text-xs font-semibold text-ink-tertiary uppercase">
                    {speakingAi ? "AI Interviewer Speaking…" : "Interviewer Question"}
                  </span>
                </div>
                <h2 className="text-xl font-semibold leading-relaxed text-ink-primary">
                  {currentQuestion.questionText}
                </h2>
              </CardContent>
            </Card>

            {/* Candidate Spoken Transcript */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-tertiary uppercase">Candidate Response</span>
                {isRecording && (
                  <span className="text-xs text-rose-500 flex items-center gap-1 font-semibold animate-pulse">
                    <span className="h-2 w-2 rounded-full bg-rose-500" /> Recording
                  </span>
                )}
              </div>
              <div className={cn(
                "min-h-[160px] p-4 rounded-xl border transition-all text-sm leading-relaxed font-mono whitespace-pre-wrap",
                isRecording
                  ? "border-accent-500 bg-surface-1 shadow-inner text-ink-primary"
                  : "border-border-default bg-surface-2/40 text-ink-secondary"
              )}>
                {transcript || (
                  <span className="text-ink-tertiary italic">
                    {isRecording ? "Listening... Speak your answer now." : "Press 'Start Answer' to speak."}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Controls & Mic Indicator */}
          <div className="flex flex-col gap-3 bg-surface-1 p-4 rounded-xl border border-border-default">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className={cn("h-4 w-4", micLevel > 10 ? "text-emerald-500" : "text-ink-tertiary")} />
                <span className="text-xs text-ink-secondary">Mic Input:</span>
                <div className="w-24 h-2 rounded-full bg-surface-3 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-75"
                    style={{ width: `${micLevel}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3">
                {!isRecording ? (
                  <Button onClick={startRecording} disabled={evaluating}>
                    <Play className="h-4 w-4" /> Start Answer
                  </Button>
                ) : (
                  <Button variant="danger" onClick={submitAnswer}>
                    <Square className="h-4 w-4" /> Submit Spoken Answer
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Turn-by-Turn AI Evaluation */}
        <div className="border-l border-border-default bg-surface-1 p-6 overflow-y-auto flex flex-col justify-between">
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold text-ink-primary flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-accent-500" /> Real-Time Response Evaluation
            </h3>

            {evaluating && (
              <div className="p-6 rounded-xl bg-surface-2 border border-border-subtle flex flex-col items-center justify-center gap-3 text-center">
                <div className="h-6 w-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-ink-secondary">Analyzing technical depth & STAR structure…</p>
              </div>
            )}

            {!evaluating && !currentFeedback && (
              <div className="p-6 rounded-xl bg-surface-2/60 border border-dashed border-border-default text-center text-xs text-ink-tertiary flex flex-col gap-2 items-center justify-center h-48">
                <span>Spoken answers are evaluated immediately using the STAR methodology.</span>
                <span className="text-[11px] text-ink-tertiary">Record an answer to reveal your score breakdown.</span>
              </div>
            )}

            {!evaluating && currentFeedback && (
              <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {/* Score Header */}
                <div className="p-4 rounded-xl bg-surface-2 border border-border-subtle flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs text-ink-tertiary uppercase font-medium">Answer Score</span>
                    <span className="text-3xl font-extrabold text-ink-primary">
                      {currentFeedback.overallAnswerScore}
                      <span className="text-sm font-normal text-ink-tertiary">/100</span>
                    </span>
                  </div>
                  {currentFeedback.starAnalysis?.isCompleteStar && (
                    <Badge tone="success" className="text-xs">Complete STAR</Badge>
                  )}
                </div>

                {/* Rubric Breakdown */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded bg-surface-2/70 border border-border-subtle flex justify-between">
                    <span className="text-ink-secondary">Relevance:</span>
                    <span className="font-bold text-ink-primary">{currentFeedback.relevanceScore}%</span>
                  </div>
                  <div className="p-2 rounded bg-surface-2/70 border border-border-subtle flex justify-between">
                    <span className="text-ink-secondary">Specificity:</span>
                    <span className="font-bold text-ink-primary">{currentFeedback.specificityScore}%</span>
                  </div>
                  <div className="p-2 rounded bg-surface-2/70 border border-border-subtle flex justify-between">
                    <span className="text-ink-secondary">Completeness:</span>
                    <span className="font-bold text-ink-primary">{currentFeedback.completenessScore}%</span>
                  </div>
                  <div className="p-2 rounded bg-surface-2/70 border border-border-subtle flex justify-between">
                    <span className="text-ink-secondary">Technical:</span>
                    <span className="font-bold text-ink-primary">{currentFeedback.technicalScore}%</span>
                  </div>
                </div>

                {/* Strengths & Missing */}
                <div className="flex flex-col gap-2 text-xs">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">What Was Good:</span>
                  <ul className="list-disc list-inside space-y-1 text-ink-secondary">
                    {currentFeedback.whatWasGood.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-col gap-2 text-xs">
                  <span className="font-semibold text-amber-600 dark:text-amber-400">What Was Missing:</span>
                  <ul className="list-disc list-inside space-y-1 text-ink-secondary">
                    {currentFeedback.whatWasMissing.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>

                {/* Better Structure */}
                {currentFeedback.betterAnswerStructure && (
                  <div className="p-3 rounded-lg bg-accent-50/20 border border-accent-200 dark:border-accent-900 text-xs text-ink-primary">
                    <strong className="text-accent-700 dark:text-accent-400">Recommended Structure: </strong>
                    {currentFeedback.betterAnswerStructure}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Next Action */}
          {currentFeedback && (
            <div className="pt-4 border-t border-border-subtle mt-4">
              <Button className="w-full" onClick={handleNextQuestion}>
                {currentIndex + 1 < questions.length ? "Next Question →" : "Finish & View Results →"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
