import { describe, expect, it } from "vitest";
import { FIELDS, fieldOf } from "./field.js";

describe("fieldOf", () => {
  it.each([
    ["Software Engineer Intern (Summer 2027)", "Software"],
    ["Software Developer Co-op (Winter 2027)", "Software"],
    ["Software Engineering Intern, iOS (Summer 2027)", "Software"],
    ["IT Intern, IT Support - Winter 2027", "Software"],
    ["Solutions Engineer Intern 2027 (USA)", "Software"],
    ["Integration Reliability Engineer Intern, Technical Operations", "Software"],
    ["PhD Intern, Software Engineer - Interaction Design (2027)", "Software"],

    ["Machine Learning Engineer Intern", "ML and AI"],
    ["Software Engineer Intern, Machine Learning (Summer 2027 - Toronto)", "ML and AI"],
    ["Software Engineer Intern AI/ML - Warsaw (2027)", "ML and AI"],
    ["Applied Scientist Intern, PhD (Summer 2027)", "ML and AI"],
    ["Intern Researcher- Computer Vision", "ML and AI"],
    ["Intern Researcher- Applied 3D AIGC", "ML and AI"],

    ["Data Science Intern", "Data"],
    ["Data Engineer Intern", "Data"],
    ["Data Analyst, Intern", "Data"],
    ["Analytics Engineer Intern", "Data"],
    ["Operations Research Intern (PhD), Summer 2027", "Data"],

    ["Security Intern, Threat Operations - Winter 2027", "Security"],
    ["Security Risk Management Intern (Summer 2027)", "Security"],
    ["Software Engineer Intern - Warsaw Security ", "Security"],

    ["Electrical Engineer, Intern - Labs (Summer 2027)", "Hardware"],
    ["Hardware Field Quality Engineer Intern (Summer 2027)", "Hardware"],
    ["Drone Operations, Intern - Labs (Summer 2027)", "Hardware"],

    ["Product Design Intern", "Product and design"],
    ["Product Manager, MBA Intern", "Product and design"],
    ["UX Quantitative Research Intern (USA)", "Product and design"],
    ["Content Design Intern (Summer 2027)", "Product and design"],

    ["Finance Co-op (Winter 2027)", "Business"],
    ["Product Marketing- Agentic Analytics Intern (Spring 2027)", "Business"],
    ["Internal Audit Analytics Intern", "Business"],
    ["People Analytics Intern", "Business"],
    ["Brokerage Operations Intern (Summer 2027)", "Business"],
    ["SDR Intern - London", "Business"],
    ["Business Analyst Intern (Summer 2027)", "Business"],

    ["Research Internship (Winter 2027)", "Other"],
    ["Intern", "Other"],
  ])("sorts %s", (title, field) => expect(fieldOf(title)).toBe(field));

  it("does not treat the word 'it' as IT", () => {
    expect(fieldOf("Make it great Intern")).toBe("Other");
  });

  it("only returns listed fields", () => {
    expect(FIELDS).toContain(fieldOf("Software Intern"));
    expect(FIELDS).toContain(fieldOf("Anything"));
  });
});
