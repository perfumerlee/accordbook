# 판매용 Formula Phase 2 설정

## Google Sheets / Apps Script

대상 스프레드시트 ID: `1_myhyTYQ_SOHwBp4ljps9KQHMFDH32QgntVzbEZ5_iE`

시트 탭 이름: **PaidFormulaLicenses**. 설정 탭은 **PaidFormulaConfig**입니다. 기존 데이터를 덮어쓰지 않으며 setup 함수가 탭과 헤더를 생성합니다.

1. 대상 스프레드시트에서 **확장 프로그램 → Apps Script**를 엽니다.
2. `scripts/apps-script/PaidFormulaRegistry.gs` 전체를 `Code.gs`에 붙여넣고 저장합니다. 기존 doPost가 있다면 별도 Apps Script 프로젝트를 사용합니다.
3. `setupPaidFormulaRegistry` 실행 후 **PaidFormulaConfig** 탭의 `value` 열에 `SELLER_TOKEN`과 `PIN_PEPPER`를 각각 직접 입력합니다. 두 값 모두 최소 32자 이상이어야 합니다. Apps Script 속성에 두 값을 두는 기존 방식도 fallback으로 지원합니다.
4. 각 비밀값은 최소 32자 이상으로 설정합니다. 아래 PowerShell을 각각 실행하면 안전한 32바이트 난수의 Base64 값이 생성됩니다. 출력은 본인만 보는 곳에서 복사하고 저장소에 커밋하지 마세요.

```powershell
$secretBytes = New-Object byte[] 32
$secretRng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$secretRng.GetBytes($secretBytes)
[Convert]::ToBase64String($secretBytes)
$secretRng.Dispose()
```

5. 함수 목록에서 `setupPaidFormulaRegistry`를 선택하여 실행하고 Google 권한을 승인합니다.
6. **배포 → 새 배포 → 웹 앱**: 실행 사용자는 **나**, 접근 사용자는 **모든 사용자**로 지정합니다. 조직 정책상 허용되지 않으면 별도 인증 백엔드가 필요합니다. 시트 자체를 공개하거나 링크 공개로 바꾸지 않습니다.
7. `/exec` URL은 Accordbook 판매자 패널에 기본값으로 내장되어 표시되지 않습니다.
8. Accordbook에서 입력창 밖을 클릭하고 **Ctrl+Alt+P**를 누릅니다. Mac은 Command+Alt+P입니다.
9. 판매자 등록 키는 `PaidFormulaConfig`의 `SELLER_TOKEN` 값과 동일하게 입력합니다. 구매자 이름과 전체 휴대폰 번호를 입력하면 `01012345678`은 `010-1234-5678`로 표시됩니다. 현재 010 번호만 지원합니다.
10. **PIN 생성**을 눌렀을 때만 발급 PIN이 화면에 나타납니다. PIN을 복사한 뒤 구매자에게 전달합니다.
11. **시트 등록 후 파일 저장**을 누릅니다. 응답 성공과 Package ID 일치를 확인해야 다운로드됩니다.

## 시트 열

`packageId`, `buyerName`, `phone`, `phoneLast4`, `pinVerifier`, `productName`, `status`, `issuedAt`, `accessMode`, `requestVerifier`

- PIN 원문, Formula 원료/Parts, 암호화 키, salt/IV는 전송·저장하지 않습니다. PIN은 HTTPS 요청에서 서버로 전달된 뒤 서버 비밀값을 사용한 HMAC 검증값으로 저장됩니다.
- 전체 연락처와 이름은 시트에 저장됩니다. 판매자와 필요한 관리자만 접근하도록 유지하세요.
- salt/IV는 암호화 파일에 존재합니다. 전체 전화번호는 구매 기록용이며 복호화 입력은 기존 이름/끝4자리/PIN입니다.
- 응답이 끊겨도 같은 열린 패널에서 재시도하면 동일 Package ID를 사용합니다. 이미 등록된 동일 요청이면 중복 행을 만들지 않습니다. 실패 후 구매자 정보 변경은 패널을 닫고 새 발급으로 진행합니다.
- 저장이 시작된 후 패널을 닫거나 페이지가 종료되면 시트에 행만 남을 수 있습니다. 다운로드 완료 여부는 OS에서 확인할 수 없습니다. 재발급 전 기존 행을 확인하세요.
- URL·판매자 키·PIN은 localStorage에 저장하지 않습니다. 다시 열면 재입력해야 합니다. PIN은 시트에서 원문으로 복구할 수 없으므로 구매자에게 전달하기 전에 복사하세요.

## 범위와 확인

현재는 **발급 기록 등록**입니다. 구매자 인증 API, 만료/취소 강제, 서버 보관 복호화 키는 아직 없습니다. `offline-credentials-v1` 파일은 시트의 상태를 변경해도 원격 차단되지 않습니다. 기존 파일의 이 특성은 Phase 3에서 서버 의존 키 설계 없이 바뀌지 않습니다.

Apps Script 코드를 수정하면 배포 관리에서 새 버전으로 갱신해야 합니다. ContentService는 googleusercontent.com으로 리다이렉트됩니다. 브라우저에서 로그인 HTML/CORS 오류가 발생하면 성공으로 간주하지 않으며 `no-cors`로 우회하지 않습니다. 배포 권한과 실제 호스팅 origin에서의 연동을 확인하세요.

실제 배포 후 QA: 잘못된 판매자 키 거부, 정상 등록 1행, 동일 요청 재시도 1행 유지, PIN 원문 없음, phoneLast4의 앞자리 0 유지, 다운로드 Package ID와 행 일치, 네트워크 실패 시 성공 표시 없음.

공식 문서: https://developers.google.com/apps-script/guides/web 및 https://developers.google.com/apps-script/guides/content
