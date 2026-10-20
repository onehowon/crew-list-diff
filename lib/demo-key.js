// 데모 서명 키(ECDSA P-256). 공개 저장소에 그대로 들어 있는 시연용 키이므로 실제 확인서에 쓰면 안 된다.
// 실제 운영에서는 대리점 담당자별 키를 HSM·OS 키 저장소에 두고, 공개키만 배포한다.
export const DEMO_KID = 'crew-diff-demo-2026-10';
export const DEMO_PRIVATE_JWK = {"kty":"EC","crv":"P-256","x":"iqE-y9i3RmBjUM2EtMyPq3tRciU5IdIfA7AewBWjK-Q","y":"vw3pK_4VzaBCN3ee-iPIksLjOJqrQSnT1sQ7Q8sWyHU","d":"ZU0CSM1PmUfTXRQs5n9QYCNVxdUE6OiIEVUwEPVsubs"};
export const DEMO_PUBLIC_JWK = { kty: DEMO_PRIVATE_JWK.kty, crv: DEMO_PRIVATE_JWK.crv, x: DEMO_PRIVATE_JWK.x, y: DEMO_PRIVATE_JWK.y };
