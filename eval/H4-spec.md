# 홀드아웃 H4 설계 (일반화 개선 커밋 e7d1d41 이후, 엔진 실행 전에 작성·커밋)

목적: H3 1회차(개선 전 처음 보는 서식)를 본 뒤 원리 수준의 일반 개선(두 자리 연도, 추정 매핑, 열 단위 서식 경보, 정정 문형)을 했다. 이 개선이 처음 보는 서식에서도 통하는지 **새 홀드아웃 H4로 1회만** 잰다. 결과를 보고 엔진·규칙·별칭 사전을 고치지 않는다. `node eval/run.mjs --split h4`는 결과 파일이 있으면 재실행을 거부한다.

## 고정 사항
- 엔진 기준: 커밋 `e7d1d41`(lib/ 변경 없이 이 문서·생성기만 추가).
- 시드 **20261115**, 새 명부 36개, 쌍 **60개**. 라벨 생성 규칙은 H1·H2·H3와 같은 코드.
- 결과: `docs/eval-H4-first-run.json`, `docs/eval-H4-first-run.md`.

## 레이아웃 H4 (독일 선주·인도네시아 송출사 혼합 양식을 흉내)
- 구분자: 세미콜론. **열 순서는 쌍마다 무작위**(최초본·수정본은 같은 순서).
- 머리말: `Schiffsname: …`, `Reise-Nr.: …`, `ETA: DD.MM.YYYY`, `Hafen: …`.
- 머리글(독일어·인도네시아어 혼합):

| 머리글 | FAL 5 항목 |
|---|---|
| `Lfd. Nr.` | 6. No. |
| `Nachname` | 7. Family name |
| `Vorname(n)` | 8. Given names |
| `Dienstgrad / Jabatan` | 9. Rank |
| `Staatsangehörigkeit` | 10. Nationality |
| `Geburtsdatum` | 11. Date of birth |
| `Geburtsort / Tempat lahir` | 12. Place of birth |
| `Geschlecht` | 13. Gender |
| `Ausweisart` | 14. Nature of identity document |
| `Nomor Paspor` | 15. Number of identity document |
| `Ausstellungsstaat` | 16. Issuing State |
| `Gültig bis / Berlaku s.d.` | 17. Expiry date |

- 날짜: 생년월일 `DD-MM-YY`(두 자리 연도), 만료일 `YYYYMMDD`.
- 성별 `L`/`P`(인도네시아어 laki-laki/perempuan), 신분증 종류 `Reisepass`/`Seefahrtsbuch`, 직급은 영문 약어.
- 메일 문체 `id4`(인도네시아어·영어 혼합, 날짜 `DD-MM-YYYY`):
  - 하선: `Mohon dicatat: {rank} {FAMILY}, {GIVEN} sign off di {port}.`
  - 승선: `Crew baru: {rank} {FAMILY}, {GIVEN} (paspor {번호}) join di {port}.`
  - 직급: `Kenaikan jabatan {FAMILY}, {GIVEN}: {old} menjadi {new}.`
  - 정정(둘 중 하나): `Mohon koreksi {항목} {FAMILY}, {GIVEN} menjadi {값}.` / `Koreksi data {FAMILY} {GIVEN}, {항목}: {이전 값} -> {값}`
  - 항목 표기: `tanggal lahir (DOB)`, `no. paspor`, `nama depan`, `tempat lahir`, `masa berlaku paspor`
  - 인사·잡음: `Selamat siang Bapak/Ibu,`, `Terlampir crew list revisi untuk {선명}.`, `Crew change di {port} sesuai jadwal.`, `Terima kasih,`

## 일부러 그대로 두는 것
- 별칭 사전에 없는 독일어·인도네시아어 머리글, `L`/`P` 성별, 인도네시아어 지시어(`menjadi`, `Kenaikan jabatan`, `koreksi`)를 사전·규칙에 맞추지 않는다. 인식 실패는 결과에 그대로 반영한다.

## 사전 확인(엔진 실행 없이 생성만)
- 생성 통계: 쌍 60, 인원 1,157, 라벨 320(예상 150 · 확인 65 · 오류 105), 표기만 다른 셀 135, 행 순서 섞기 14쌍.
- 머리글 겹침(정규화 기준): 개발·H1·H2·H3와 겹치는 머리글 없음.
