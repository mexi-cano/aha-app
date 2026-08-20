import type { Response } from "express";

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
}

export function sendProblem(
  response: Response,
  status: number,
  code: string,
  title: string,
  detail: string,
): void {
  const body: ProblemBody = {
    type: `https://aha.its.example/problems/${code}`,
    title,
    status,
    detail,
    code,
  };
  response.status(status).type("application/problem+json").json(body);
}
