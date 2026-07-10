export type ProjectStatus = "active" | "completed" | "archived";

export interface Project {
  id: string;
  name: string;
  client: string;
  location: string;
  description: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  client: string;
  location: string;
  description: string;
}