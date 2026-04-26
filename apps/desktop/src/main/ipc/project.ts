import { ipcMain } from "electron";
import { randomUUID } from "crypto";
import * as path from "path";
import {
  deleteProject as deleteProjectRow,
  ensureProjectLayout,
  getProject,
  insertProject,
  listProjects,
  removeProjectTree,
  sanitizeProjectName,
  touchProject,
  updateProject,
} from "@inkforge/storage";
import type {
  ProjectCreateInput,
  ProjectDeleteInput,
  ProjectOpenInput,
  ProjectRecord,
  ProjectUpdateInput,
  ipcChannels,
} from "@inkforge/shared";
import { getAppContext, updateWorkspaceConfig } from "../services/app-state";

const PROJECT_CREATE: typeof ipcChannels.projectCreate = "project:create";
const PROJECT_LIST: typeof ipcChannels.projectList = "project:list";
const PROJECT_UPDATE: typeof ipcChannels.projectUpdate = "project:update";
const PROJECT_DELETE: typeof ipcChannels.projectDelete = "project:delete";
const PROJECT_OPEN: typeof ipcChannels.projectOpen = "project:open";

export function registerProjectHandlers(): void {
  ipcMain.handle(PROJECT_CREATE, async (_event, input: ProjectCreateInput): Promise<ProjectRecord> => {
    const ctx = getAppContext();
    const name = input.name.trim();
    if (!name) throw new Error("Project name is required");
    const safeName = sanitizeProjectName(name);
    const projectPath = input.path?.trim()
      ? path.resolve(input.path)
      : path.join(ctx.workspaceDir, "projects", safeName);
    ensureProjectLayout(projectPath, name);
    const record = insertProject(ctx.db, {
      id: randomUUID(),
      name,
      path: projectPath,
      dailyGoal: input.dailyGoal,
    });
    touchProject(ctx.db, record.id);
    if (!ctx.config.workspaceDir) {
      updateWorkspaceConfig({ workspaceDir: ctx.workspaceDir });
    }
    return record;
  });

  ipcMain.handle(PROJECT_LIST, async (): Promise<ProjectRecord[]> => {
    const ctx = getAppContext();
    return listProjects(ctx.db);
  });

  ipcMain.handle(PROJECT_UPDATE, async (_event, input: ProjectUpdateInput): Promise<ProjectRecord> => {
    const ctx = getAppContext();
    return updateProject(ctx.db, input);
  });

  ipcMain.handle(PROJECT_DELETE, async (_event, input: ProjectDeleteInput): Promise<{ id: string }> => {
    const ctx = getAppContext();
    const project = getProject(ctx.db, input.id);
    deleteProjectRow(ctx.db, input.id);
    if (project && input.removeFiles) removeProjectTree(project.path);
    return { id: input.id };
  });

  ipcMain.handle(PROJECT_OPEN, async (_event, input: ProjectOpenInput): Promise<ProjectRecord> => {
    const ctx = getAppContext();
    const project = getProject(ctx.db, input.id);
    if (!project) throw new Error(`Project not found: ${input.id}`);
    touchProject(ctx.db, input.id);
    return { ...project, lastOpened: new Date().toISOString() };
  });
}
