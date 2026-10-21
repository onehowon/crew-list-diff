// "변경 반영 확인서": 담당자 승인 결과를 JSON으로 묶고 SHA-256 해시 + ECDSA P-256(ES256) 서명. WebCrypto 사용.
import { signJws, verifyJws, decodeJws, sha256 } from './jose.js';
import { DEMO_KID, DEMO_PRIVATE_JWK, DEMO_PUBLIC_JWK } from './demo-key.js';
import { fieldLabel } from './fields.js';
import { decisionOf, pendingItems } from './export.js';

export async function buildConfirmation({ report, decisions, approver, at, finalCsv }) {
  // 선사 문의가 남으면 확정 기록을 만들지 않는다(미확정 검토본은 확인서 대상이 아님)
  const pend = pendingItems(report, decisions).length;
  if (pend) throw new Error(`선사 문의 ${pend}건이 남아 있어 확인서를 만들 수 없음`);
  const h = report.B.header;
  const list = report.items.map((it) => ({
    id: it.id,
    person: it.person,
    kind: it.kind,
    field: it.field ? fieldLabel(it.field) : null,
    before: it.before?.raw?.trim?.() ?? null,
    after: it.after?.raw?.trim?.() ?? null,
    class: it.class,
    rules: (it.rules || []).map((r) => r.id),
    directiveLine: it.directive?.line ?? null,
    decision: decisionOf(decisions, it),
  }));
  return {
    typ: 'crew-change-confirmation',
    v: 1,
    demo: true,
    ship: { name: h.shipName?.value ?? '', imo: h.imo?.value ?? '', voyage: h.voyage?.value ?? '' },
    port: h.port?.value ?? '',
    date: h.date?.value ?? '',
    approver,
    decidedAt: at,
    counts: {
      approved: list.filter((x) => x.decision === 'approve').length,
      kept: list.filter((x) => x.decision === 'keep').length,
      cosmeticFolded: report.cosmetic.length,
    },
    changes: list,
    finalListSha256: await sha256(finalCsv),
  };
}

export async function signConfirmation(payload, jwk = DEMO_PRIVATE_JWK, kid = DEMO_KID) {
  return signJws({ typ: 'JWT', kid }, payload, jwk);
}

// 서명 검증 + (주어지면) 최종 명부 CSV 해시 대조
export async function verifyConfirmation(jws, { publicJwk = DEMO_PUBLIC_JWK, finalCsv } = {}) {
  let decoded;
  try { decoded = decodeJws(jws); } catch (e) { return { ok: false, signature: false, hash: null, error: e.message }; }
  const signature = await verifyJws(jws, publicJwk);
  let hash = null;
  if (finalCsv != null) hash = (await sha256(finalCsv)) === decoded.payload.finalListSha256;
  return { ok: signature && hash !== false, signature, hash, payload: decoded.payload };
}
