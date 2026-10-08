export interface KnowledgeGraphNode {
  questions?: number;
}

export interface KnowledgeGraphPoint {
  x: number;
  y: number;
}

export const KNOWLEDGE_GRAPH_WIDTH = 320;
export const KNOWLEDGE_GRAPH_HEIGHT = 240;
const GRAPH_PADDING = 26;

export function knowledgeNodeRadius(node: KnowledgeGraphNode): number {
  const questions = typeof node.questions === 'number' ? node.questions : 0;
  return Math.max(7, Math.min(22, 7 + Math.sqrt(questions) * 4));
}

/** Deterministic force layout matching the legacy Tutor knowledge map. */
export function layoutKnowledgeGraph(
  nodes: readonly KnowledgeGraphNode[],
  width = KNOWLEDGE_GRAPH_WIDTH,
  height = KNOWLEDGE_GRAPH_HEIGHT,
): KnowledgeGraphPoint[] {
  const count = nodes.length;
  if (!count) return [];

  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - GRAPH_PADDING - 6;
  const points: KnowledgeGraphPoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (2 * Math.PI * index) / count - Math.PI / 2;
    points.push({ x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) });
  }
  if (count < 2) {
    if (count === 1) points[0] = { x: centerX, y: centerY };
    return points;
  }

  const idealSpacing = Math.max(30, Math.min(width, height) / Math.sqrt(count));
  const iterations = 160;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const temperature = 1 - iteration / iterations;
    const displacement = points.map(() => ({ x: 0, y: 0 }));

    for (let left = 0; left < count; left += 1) {
      for (let right = left + 1; right < count; right += 1) {
        const dx = points[left].x - points[right].x;
        const dy = points[left].y - points[right].y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (idealSpacing * idealSpacing) / distance;
        const unitX = dx / distance;
        const unitY = dy / distance;
        displacement[left].x += unitX * force;
        displacement[left].y += unitY * force;
        displacement[right].x -= unitX * force;
        displacement[right].y -= unitY * force;
      }
    }

    for (let edge = 0; edge < count - 1; edge += 1) {
      const dx = points[edge].x - points[edge + 1].x;
      const dy = points[edge].y - points[edge + 1].y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const force = (distance * distance) / idealSpacing;
      const unitX = dx / distance;
      const unitY = dy / distance;
      displacement[edge].x -= unitX * force;
      displacement[edge].y -= unitY * force;
      displacement[edge + 1].x += unitX * force;
      displacement[edge + 1].y += unitY * force;
    }

    for (let index = 0; index < count; index += 1) {
      displacement[index].x += (centerX - points[index].x) * 0.03;
      displacement[index].y += (centerY - points[index].y) * 0.03;
      const distance = Math.sqrt(displacement[index].x ** 2 + displacement[index].y ** 2) || 0.01;
      const step = Math.min(distance, 8 * temperature + 0.5);
      points[index].x = Math.max(GRAPH_PADDING, Math.min(width - GRAPH_PADDING, points[index].x + (displacement[index].x / distance) * step));
      points[index].y = Math.max(GRAPH_PADDING, Math.min(height - GRAPH_PADDING, points[index].y + (displacement[index].y / distance) * step));
    }
  }
  return points;
}
