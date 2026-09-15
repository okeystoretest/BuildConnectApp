import assert from "node:assert/strict";
import test from "node:test";
import { buildCreatePayload } from "./payload";

const ticket = {
  id: "t1", code: "MOT-014", serviceType: "Entrega", description: "Levar amostras", contact: "11 9999-0000",
  departureStreet: "Rua A", departureNumber: "10", departureDistrict: "Centro",
  destStreet: "Rua B", destNumber: null, destDistrict: "Bairro",
};

test("monta o payload no contrato do Flow", () => {
  const p = buildCreatePayload(ticket, { id: "u1", name: "Ana", sector: "Comercial" }, "drv-1");
  assert.equal(p.connectId, "t1");
  assert.equal(p.code, "MOT-014");
  assert.deepEqual(p.requester, { connectId: "u1", name: "Ana", sector: "Comercial" });
  assert.equal(p.originStreet, "Rua A");
  assert.equal(p.originNumber, "10");
  assert.equal(p.destStreet, "Rua B");
  assert.equal(p.destNumber, null);
  assert.equal(p.driverId, "drv-1");
});

test("sem motorista e sem setor: campos nulos, não undefined (JSON não perde a chave)", () => {
  const p = buildCreatePayload(ticket, { id: "u1", name: "Ana", sector: null }, null);
  assert.equal(p.driverId, null);
  assert.equal(p.requester.sector, null);
  assert.ok("driverId" in JSON.parse(JSON.stringify(p)));
});
