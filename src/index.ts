export type Scalar = string | number | boolean;

export type QuestionType = "single" | "multiple";

export interface Label {
  id: number;
  label: string;
  value: Scalar;
  description: string;
}

export interface Question {
  id: string;
  title: string;
  description: string;
  type: QuestionType;
  labels: Label[];
}

export interface DaskRequest {
  questions: Question[];
}

export type AnswerValue =
  | { source: "label"; value: Scalar }
  | { source: "custom"; value: string };

export interface Answer {
  id: string;
  value: AnswerValue[];
}

export interface DaskResult {
  answers: Answer[];
}
