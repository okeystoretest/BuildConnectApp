import assert from "node:assert/strict";
import test from "node:test";
import { flowStateSchema, mirrorUpdate, needsReconcile, RECONCILE_AFTER_MS } from "./mirror";

const agora = new Date("2026-09-15T12:00:00Z");

test("estado do Flow válido passa; status desconhecido é recusado", () => {
  const ok = flowStateSchema.safeParse({
    status: "EM_ANDAMENTO", driverName: "João", assignedAt: "2026-09-15T11:00:00Z",
    startedAt: "2026-09-15T11:30:00Z", finishedAt: null, distanceKm: null, cancelReason: null,
  });
  assert.equal(ok.success, true);
  const bad = flowStateSchema.safeParse({ status: "EM_ROTA", driverName: null });
  assert.equal(bad.success, false);
});

test("mirrorUpdate aplica ESTADO: status, motorista, datas e limpa o erro de envio", () => {
  const u = mirrorUpdate({
    status: "CONCLUIDO", driverName: "João", assignedAt: "2026-09-15T11:00:00Z",
    startedAt: "2026-09-15T11:30:00Z", finishedAt: "2026-09-15T11:50:00Z", distanceKm: 4.2, cancelReason: null,
  }, agora);
  assert.equal(u.status, "CONCLUIDO");
  assert.equal(u.externalAssigneeName, "João");
  assert.equal(u.startedAt?.toISOString(), "2026-09-15T11:30:00.000Z");
  assert.equal(u.finishedAt?.toISOString(), "2026-09-15T11:50:00.000Z");
  assert.equal(u.distanceKm, 4.2);
  assert.equal(u.flowSyncError, null);
  assert.equal(u.flowSyncedAt, agora);
});

test("mirrorUpdate sem motorista zera o nome (desatribuído)", () => {
  const u = mirrorUpdate({
    status: "PENDENTE", driverName: null, assignedAt: null, startedAt: null, finishedAt: null, distanceKm: null, cancelReason: null,
  }, agora);
  assert.equal(u.status, "PENDENTE");
  assert.equal(u.externalAssigneeName, null);
  assert.equal(u.startedAt, null);
});

test("needsReconcile: só MOTORISTAS com flowId, não final, e espelho velho", () => {
  const base = { destination: "MOTORISTAS", status: "ATRIBUIDO", flowId: "f1", flowSyncedAt: new Date(agora.getTime() - RECONCILE_AFTER_MS - 1) };
  assert.equal(needsReconcile(base, agora), true);
  assert.equal(needsReconcile({ ...base, flowSyncedAt: new Date(agora.getTime() - 1000) }, agora), false);
  assert.equal(needsReconcile({ ...base, status: "CONCLUIDO" }, agora), false);
  assert.equal(needsReconcile({ ...base, status: "CANCELADO" }, agora), false);
  assert.equal(needsReconcile({ ...base, destination: "TI" }, agora), false);
  assert.equal(needsReconcile({ ...base, flowId: null }, agora), false);
  // flowId presente e nunca sincronizado: reconcilia.
  assert.equal(needsReconcile({ ...base, flowSyncedAt: null }, agora), true);
});
