# 홀드아웃 H3 설계 (엔진 실행 전에 작성·커밋)

목적: H1·H2는 1회차 결과를 본 뒤 엔진 버그 3건을 고치는 데 쓰였으므로 더는 깨끗한 홀드아웃이 아니다. H3는 **현재 엔진 코드를 고정한 뒤** 새로 만들고, **엔진·기준선을 1회만 실행**해 그 결과를 대표값으로 쓴다. 결과를 보고 엔진·규칙·별칭 사전을 고치지 않는다.

## 고정 사항
- 엔진 기준 커밋: 이 문서를 추가하는 커밋의 직전 커밋(엔진 lib/ 변경 없음).
- 시드: **20261101** (개발·H1·H2 시드 20261020과 다름). 명부도 새로 생성(36개), 쌍 **60개**.
- 라벨 분포: 생성 규칙(예상·확인·오류 주입 비율, 표기만 변경, 행 순서 섞기 35%)은 H1·H2와 같은 코드를 쓴다.
- 실행: `node eval/run.mjs --split h3` 를 1회 실행 → `docs/eval-H3-first-run.md`, `docs/eval-H3-first-run.json`.

## 레이아웃 H3 (필리핀 선원 송출사 양식을 흉내 낸 혼합 표기)
- 구분자: 쉼표(CSV), 머리글에 괄호·번호 접두·혼합 대소문자·스페인어(필리핀식) 표기 일부.
- 머리말: `Vessel Name: …`, `Voyage: …`, `ETA: YYYY/MM/DD`, `Port of Arrival: …` (한 칸에 콜론으로).
- 열 순서(개발·H1·H2와 다름):

| 순서 | 머리글 | FAL 5 항목 |
|---|---|---|
| 1 | `#` | 6. No. |
| 2 | `Rank (Cargo)` | 9. Rank |
| 3 | `7. Family name (Apellido)` | 7. Family name |
| 4 | `8. Given names (Nombres)` | 8. Given names |
| 5 | `Nacionalidad` | 10. Nationality |
| 6 | `Sexo` | 13. Gender |
| 7 | `Date of Birth (Fecha de nac.)` | 11. Date of birth |
| 8 | `Lugar de nacimiento` | 12. Place of birth |
| 9 | `Doc. Type` | 14. Nature of identity document |
| 10 | `Passport/SIRB No.` | 15. Number of identity document |
| 11 | `Issuing State` | 16. Issuing State |
| 12 | `Expiry date` | 17. Expiry date |

- 날짜: 생년월일 `YYYY/MM/DD`, 만료일 `DD MMM YY`(두 자리 연도, 예: `05 MAR 29`).
- 직급 표기: 대문자 약어(`AB`, `C/O` …). 성별: `M`/`F`. 신분증 종류: `PASSPORT` / `SIRB`.
- 메일 문체 `en3`(새 문체, 필리핀식 영어):
  - 하선: `Pls be advised that {rank} {GIVEN} {FAMILY} will disembark at {port}.`
  - 승선: `Joining: {rank} {GIVEN} {FAMILY}, PPT {번호}, {국적}.`
  - 직급: `Promotion - {GIVEN} {FAMILY} from {old} to {new}.`
  - 정정: `Kindly correct the {항목} of {GIVEN} {FAMILY}, should be {값}.` (날짜 값은 `YYYY/MM/DD`)
  - 머리 줄·인사: `Hi Sir/Maam,`, `Pls see attached crew list.`, `Thanks and regards,`

## 일부러 그대로 두는 것(현실적인 미지 표기)
- 별칭 사전·키워드 규칙에 없을 수 있는 머리글(`Nacionalidad`, `Lugar de nacimiento`, `#`, `Rank (Cargo)` 등)과 두 자리 연도 날짜를 사전에 맞추지 않는다. 인식 실패는 그대로 결과에 반영한다.

## 사전 확인(엔진 실행 없이 생성만)
- 생성 통계: 쌍 60, 인원 1,194, 라벨 323(예상 158 · 확인 73 · 오류 92), 표기만 다른 셀 139, 행 순서 섞기 25쌍.
- 머리글 겹침(정규화 기준): `Doc. Type`이 개발 D2의 `Doc type`과 같다. 나머지 11개는 개발·H1·H2와 다르다.
