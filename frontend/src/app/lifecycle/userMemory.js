import { reportSwallow } from '../../util/reportSwallow.ts';

/* Cached user memories are shared by auth cleanup and prompt construction. */
let userMemories = [];

export function getUserMemories() {
  return userMemories;
}

export function clearUserMemories() {
  try { userMemories = []; }
  catch (error) { reportSwallow(error, 'app/lifecycle.clearUserMemories'); }
}
