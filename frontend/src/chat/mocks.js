/* chat/mocks.js — Wave 0c of main-js-split plan.
 * Legacy fallback mock pools for when no API is available. Extracted from
 * main.js region 14 (L3964..L4185). No external dependencies; pure data
 * with random selection. Mutates only module-private state.
 */

/* Mock Socratic questions (fallback when no API available). */
function _origGenerateSocraticQuestion(node, domain) {
  var qs = {
    fuzzy: [
      "Can you describe " + domain + " in your own words, as if explaining it to someone who has never heard of it?",
      "What do you think is the most commonly misunderstood aspect of " + domain + "?",
      "If you had to identify one gap in your understanding of " + domain + ", what would it be?",
      "Can you think of a situation where the standard rules of " + domain + " might not apply?",
      "What is the relationship between " + domain + " and the broader field it belongs to?",
      "If you were explaining " + domain + " to a skeptical friend, what would be your strongest argument for why it matters?",
      "What part of " + domain + " do you find most counterintuitive?",
      "How does " + domain + " connect to things you already know well?",
      "What question about " + domain + " have you hesitated to ask because it might seem too basic?",
      "If " + domain + " were a story, what would be its central conflict?",
    ],
    blank: [
      "What do you already know, or think you know, about " + domain + "?",
      "Before we dive in, what questions do you have about " + domain + "?",
      'When you hear the term "' + domain + '", what comes to mind first?',
      "What made you interested in learning about " + domain + "?",
      "If " + domain + " were a tool, what problem do you think it solves?",
      "Have you encountered " + domain + " in your daily life, even without realizing it?",
      "What do you imagine an expert in " + domain + " thinks about that beginners do not?",
      "Is there anything about " + domain + " that feels intimidating? What specifically?",
      "If you could ask one question to the best " + domain + " expert in the world, what would it be?",
      "What would success look like for you in learning " + domain + "?",
    ],
    internalized: [
      "Can you identify an assumption that most people make about " + domain + " that might not always hold true?",
      "How would you test whether someone truly understands " + domain + " versus just memorizing facts?",
      "What is a concrete example from your own experience that illustrates a key principle of " + domain + "?",
      "If you were to teach " + domain + " to someone, where would you start and why?",
      "What is the most elegant or beautiful idea within " + domain + " in your opinion?",
      "Can you think of two seemingly unrelated ideas in " + domain + " that actually share a deep connection?",
      "What limitations or boundaries of " + domain + " are rarely discussed?",
      "How has your understanding of " + domain + " changed over time? What caused those shifts?",
      "If you had to argue against a core principle of " + domain + ", what would your argument be?",
      "Where do you think " + domain + " will be in 20 years, and what will drive that change?",
    ],
  };
  var pool = qs[node.status] || qs.fuzzy;
  var idx = Math.floor(Math.random() * pool.length);
  return { text: pool[idx], node: node };
}

function _origGenerateFollowUp(answer, node, domain) {
  var phrase = extractKeyPhrase(answer);
  var fus = [
    'You mentioned "' + phrase + '". Could you elaborate on what you mean by that?',
    "That is an interesting perspective. What leads you to that conclusion?",
    "Can you give me a specific, concrete example of what you just described?",
    "What would be the strongest argument against what you just said?",
    "How does what you described connect to the broader concept of " + domain + "?",
    "If someone disagreed with your view, what might their reasoning be?",
    "Is there an assumption in your answer that might not always be true?",
    'You used the term "' + phrase + '". How would you define that in your own words?',
    "Can you walk me through the reasoning behind that, step by step?",
    "What experience or evidence supports what you just shared?",
    "If we zoom out, how does this relate to the bigger picture of " + domain + "?",
    "Is what you described always the case, or can you think of exceptions?",
  ];
  return fus[Math.floor(Math.random() * fus.length)];
}
function extractKeyPhrase(text) {
  var words = text.split(/\s+/);
  if (words.length < 4) return text;
  var start = Math.floor(Math.random() * Math.min(words.length - 3, words.length));
  return words.slice(start, start + 3).join(" ");
}

var _explanationMock = {
  fuzzy: [
    "Let us step back and approach this from a different angle. When we encounter a concept like this, it helps to start not with definitions but with concrete examples. Consider a situation where you have used this idea without realizing it. The key is to recognize the pattern, not memorize the terminology. Once the pattern is clear, the formal definition becomes much easier to grasp. Think about a specific instance in your own life where this pattern appears. What was the situation? What did you do? What was the result?",
    "Sometimes the best way to understand something is to see it in action. Imagine watching someone who deeply understands this topic. What would they notice that others miss? What questions would they ask? Try to put yourself in that mindset. Instead of trying to absorb isolated facts, try to see the patterns. Patterns are the language of deep understanding. Once you see them, the facts organize themselves.",
    "A useful way to approach this is to ask: what problem was this idea originally designed to solve? Ideas do not emerge from nowhere. They come from someone encountering a real challenge and needing a new way to think about it. If you can understand the original problem, the solution makes much more sense. So let us trace this back. What need, what gap, what frustration gave birth to this concept?",
  ],
  blank: [
    "This is new territory, so let us build from the ground up. The most important thing to understand first is why this concept exists. Every idea in any field exists because someone encountered a problem and needed a solution. If you can understand the original problem, the solution makes intuitive sense. So let us start there. What problem do you think this concept was designed to solve? Even if you are not sure, take a guess. The act of guessing activates the part of your brain that will later connect to the correct answer.",
    "Learning something new is like exploring an unfamiliar city. At first everything seems disconnected. But gradually you start to recognize landmarks, then streets, then neighborhoods. The same happens with ideas. Right now you are building your first landmarks. Do not worry about seeing the whole map yet. Focus on one thing at a time. What is the first landmark you want to establish?",
    "Think of this as building a mental model from scratch. Every complex idea can be broken down into simpler pieces. The trick is finding the right starting piece, the one that makes everything else click. Usually that piece is the simplest version of the idea, stripped of jargon and technical detail. Once that piece is in place, everything else attaches to it naturally.",
  ],
  internalized: [
    "You seem to have a solid grasp of this. Let us push deeper. A sign of true understanding is being able to identify the boundaries of an idea: where it applies and where it breaks down. Can you think of a scenario where the usual rules of this concept would not apply, or would produce a misleading result? Edge cases reveal whether your understanding is flexible or rigid.",
    "Now that the foundation is solid, we can explore the subtleties. The difference between competence and mastery often lies in understanding the exceptions, the edge cases, the situations where the standard approach fails. Think about the assumptions baked into what you know. Which of those assumptions are actually optional? Which are truly fundamental?",
    "Mastery is not about knowing more facts. It is about developing intuition for what matters and what does not. When you look at this topic now, what do you see that a beginner would miss? What shortcuts has your experience taught you? Those insights are the real measure of deep understanding.",
  ],
};
var explanationContent = { fuzzy: _explanationMock.fuzzy, blank: _explanationMock.blank, internalized: _explanationMock.internalized };
function _origGetExplanation(status) {
  var pool = explanationContent[status] || explanationContent.fuzzy;
  return pool[Math.floor(Math.random() * pool.length)];
}

export {
  _origGenerateSocraticQuestion, _origGenerateFollowUp, extractKeyPhrase,
  _explanationMock, explanationContent, _origGetExplanation,
};
