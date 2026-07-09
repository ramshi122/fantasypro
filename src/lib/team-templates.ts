/**
 * Team Templates — Save/load favorite team combinations
 * =====================================================
 * localStorage "apna-cricket-templates"
 * Schema: {id, matchId, templateName, players, captain, vc, createdAt}
 */

import type { MatchPlayer } from "./api";

const KEY = "apna-cricket-templates";

export interface TeamTemplate {
  id: string;
  matchId: string;
  templateName: string;
  players: MatchPlayer[];
  captain: string | number;
  vc: string | number;
  createdAt: number;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readAll(): TeamTemplate[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(templates: TeamTemplate[]): void {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(templates));
}

function genId(): string {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Save a team as a named template for a match.
 */
export function saveTemplate(
  name: string,
  team: { players: MatchPlayer[]; captain: string | number; vc: string | number },
  matchId: string
): TeamTemplate {
  const templates = readAll();
  const tpl: TeamTemplate = {
    id: genId(),
    matchId,
    templateName: name,
    players: team.players,
    captain: team.captain,
    vc: team.vc,
    createdAt: Date.now(),
  };
  templates.unshift(tpl);
  // Cap at 100 templates
  if (templates.length > 100) templates.length = 100;
  writeAll(templates);
  return tpl;
}

/**
 * Get all templates for a match (or all if no matchId).
 */
export function getTemplates(matchId?: string): TeamTemplate[] {
  const all = readAll();
  if (!matchId) return all;
  return all.filter((t) => t.matchId === matchId);
}

/**
 * Delete a template by ID.
 */
export function deleteTemplate(id: string): void {
  const all = readAll().filter((t) => t.id !== id);
  writeAll(all);
}

/**
 * Get a template by ID and return its contents ready to apply.
 */
export function applyTemplate(id: string): TeamTemplate | null {
  return readAll().find((t) => t.id === id) || null;
}

/**
 * Rename a template.
 */
export function renameTemplate(id: string, newName: string): void {
  const all = readAll();
  const t = all.find((x) => x.id === id);
  if (t) {
    t.templateName = newName;
    writeAll(all);
  }
}
