# User Experience Swimlane — Church Election App

Lanes = who does it. Columns = the Church Manual (Ch. 8) stages.
Read left → right; a box lower/higher means the *other lane* acts at that stage.

| Stage → | 1 · Setup | 2 · Nominating | 3 · Consent | 4 · Report (1st Reading) | 5 · Objections | 6 · Voting (2nd Reading) | 7 · Certification |
|---|---|---|---|---|---|---|---|
| **Pastor / Chair** | Creates election: church, 1–2 yr term, chair + secretary. Sets departments from the SDA dropdown (add/remove) | Convenes committee; leads prayerful deliberation per office | Oversees consent checks before any name is read publicly | Presents the report to the church | Refers objections back to committee (motion to refer = non-debatable, majority) | Opens voting: projects QR + 6-digit code, or runs pass-the-device. Closes voting | Certifies the elected board with the secretary |
| **Nominating Committee** | — | Studies needs + fitness for each office; proposes nominees per department. **Anonymous ballot in-app when choosing between candidates** | Reviews consent status flags (Asked / Agreed / Declined) | Supports the report as presented | Hears members who object, in private; may replace a name and amend the report | Votes as church members | — |
| **Secretary** | Recorded in the election setup | Records committee membership | Tracks consent per nominee in the app | Reads / files the report for the minutes | Notes objections referred (no names in public minutes beyond the motion) | Records ballot count + totals | Produces the copyable minutes report; files the certified board list |
| **Nominees** | — | (Not present during deliberation) | Asked privately → Agree or Decline in the tracker | Name read to the church only if consent = Agreed | May withdraw via the committee | — | New officers take office for the term |
| **Church Members / Voters** | Church votes the organizing committee, then votes the nominating committee (in business session) | — | — | Hears the 1st reading — no vote yet | May appear before the committee, or move to refer the whole report back | **Scan QR / enter code on own phone** (or pass-the-device): anonymous ballot, one vote per device, no name recorded. Majority elects | Receives the announced elected board |
| **App / System** | Saves election on device; EN/ES toggle for all screens | Stores offices + nominees; hides anonymity: ballots carry **no voter field** | Flags anyone not yet Agreed so the report can't skip ahead cleanly | Generates the readable report view | Locks the report while referred; unlocks amended version | Creates session (QR + code), accepts one ballot per device, streams totals to chair every 3s, blocks ballots when closed | Totals-only results, elected badges, one-tap copy report for the minutes |

## Happy path (one line)
Chair sets up → Committee nominates (anonymous in-app ballots as needed) → Consent confirmed → 1st reading → Objections heard privately / report amended if needed → 2nd reading vote by QR or pass-the-device → Chair + secretary certify → Board announced.

## Guardrails the swimlane enforces
- No nominations from the floor — names only enter through the Committee lane.
- No name reaches the Report stage without Consent = Agreed.
- The System lane never learns who voted — voter identity exists in no lane's records.
- Objections stay between the Member lane and the Committee lane, never debated publicly.
