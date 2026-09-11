import assert from "node:assert/strict";
import test from "node:test";
import {
  buildScriptPrompt,
  composeSystemInstruction,
  FALLBACK_INSTRUCTION,
  type ScriptSubject,
} from "./script-prompt";

const minimo: ScriptSubject = {
  title: "Reel de lançamento",
  date: "2026-09-15",
  time: "10:00",
  funnel: "TOFU",
  formats: ["REEL"],
  status: "IDEIA",
  platforms: [],
};

test("card mínimo: só as linhas obrigatórias, sem 'não informado'", () => {
  const prompt = buildScriptPrompt(minimo);
  assert.match(prompt, /Título: Reel de lançamento/);
  assert.match(prompt, /Data e horário: 15\/09\/2026 às 10:00/);
  assert.match(prompt, /Etapa do funil: TOFU · Atração/);
  assert.match(prompt, /Formatos: Reel/);
  assert.match(prompt, /Status: Ideia/);
  assert.doesNotMatch(prompt, /Marca:/);
  assert.doesNotMatch(prompt, /Redes:/);
  assert.doesNotMatch(prompt, /Observações:/);
  assert.doesNotMatch(prompt, /Responsável:/);
  assert.doesNotMatch(prompt, /não informad/i);
});

test("card completo: marca, redes, responsável e observações entram", () => {
  const prompt = buildScriptPrompt({
    ...minimo,
    brand: "LOV_CLUB",
    platforms: ["INSTAGRAM", "TIKTOK"],
    ownerName: "Ana Souza",
    notes: "Gravar na loja.\nMostrar a vitrine.",
  });
  assert.match(prompt, /Marca: Lov Club/);
  assert.match(prompt, /Redes: Instagram, TikTok/);
  assert.match(prompt, /Responsável: Ana Souza/);
  assert.match(prompt, /Observações:\nGravar na loja\.\nMostrar a vitrine\./);
});

test("formato OUTRO usa o texto livre, não a palavra 'Outro'", () => {
  const prompt = buildScriptPrompt({
    ...minimo,
    formats: ["STORY", "OUTRO"],
    formatOther: "Bastidores",
  });
  assert.match(prompt, /Formatos: Story, Bastidores/);
  assert.doesNotMatch(prompt, /Outro/);
});

test("observação só de espaços não vira linha", () => {
  const prompt = buildScriptPrompt({ ...minimo, notes: "   \n  " });
  assert.doesNotMatch(prompt, /Observações:/);
});

test("composição: Padrão vem antes da marca, separadas por linha em branco", () => {
  assert.equal(
    composeSystemInstruction("Regras gerais.", "Tom da marca."),
    "Regras gerais.\n\nTom da marca.",
  );
});

test("composição: só Padrão, só marca, e nenhuma → fallback", () => {
  assert.equal(composeSystemInstruction("Regras gerais.", null), "Regras gerais.");
  assert.equal(composeSystemInstruction(null, "Tom da marca."), "Tom da marca.");
  assert.equal(composeSystemInstruction(null, null), FALLBACK_INSTRUCTION);
  assert.equal(composeSystemInstruction("  ", ""), FALLBACK_INSTRUCTION);
});
