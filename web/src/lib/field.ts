/**
 * field.ts: sorts a posting into a field of work from its title.
 * The first rule that matches wins, so specific fields come before broad ones:
 * "Software Engineer, Machine Learning" is ML, and "Security Risk" is Security, not Business.
 */

export const FIELDS = ["Software", "ML and AI", "Data", "Security", "Hardware", "Product and design", "Business", "Other"];

const RULES: [string, RegExp][] = [
  ["ML and AI", /machine learning|\b(ai|ml|aigc)\b|computer vision|research scientist|applied scientist/i],
  ["Security", /security|threat/i],
  ["Data", /\bdata\b|analytics engineer|product analytics|operations research/i],
  ["Hardware", /hardware|electrical|mechanical|industrialization|drone|\b(rf|analog|fpga|asic)\b|firmware|embedded|design for test/i],
  [
    "Software",
    /software|developer|front-?end|back-?end|full-?stack|\b(swe|sde|qa)\b|devops|reliability engineer|solutions engineer|forward deployed|systems engineer|test automation/i,
  ],
  ["Software", /\bIT\b/], // case matters here, or the word "it" would count
  ["Product and design", /product (manage|design)|\bux\b|user research|content design|illustrator/i],
  [
    "Business",
    /financ|account|\btax\b|audit|controller|treasury|sales|\bsdr\b|marketing|growth|operations|strategy|partnership|business|\brisk\b|analyst|analytics|market|people|talent|recruit|policy|legal|vendor|real estate|learning & development|employee|enablement|special projects|programs/i,
  ],
];

export function fieldOf(title: string): string {
  return RULES.find(([, rule]) => rule.test(title))?.[0] ?? "Other";
}
