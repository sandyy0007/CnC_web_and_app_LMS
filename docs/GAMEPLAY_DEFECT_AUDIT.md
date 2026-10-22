# WINNERS CREEK LMS — GAMEPLAY DEFECT AUDIT (ALL 34 GAMES)
**Comprehensive Root Cause Analysis, Mounting Trace, and Mechanics Inventory**

---

## 1. Executive Summary & Root Cause Analysis

### The Critical Bug: Why Red-Flag Pop Displayed "Reading Passage + 3 Locks"

When any student navigated to `/student/games/red-flag-pop/play` (or any of the 27 new game routes), the screen displayed:
> **A reading passage on the left, multiple-choice questions on the right, and three virtual locks (Detail Lock, Vocabulary Lock, Inference Lock).**

#### The Execution Trace:
1. **Dynamic Route**: `apps/web/src/app/student/games/[gameId]/play/page.tsx` captures `params.gameId = "red-flag-pop"`.
2. **Mounting**: Passes `gameId` into `<GameRunner gameId={gameId} />`.
3. **Session Start**: `GameRunner` calls `POST /api/v1/student/games/red-flag-pop/start`. The backend validates the game, creates attempt `id`, and returns `data.gameCode = "red-flag-pop"`.
4. **Metadata Lookup**: `getGameMetadata("red-flag-pop")` is queried from `apps/web/src/components/games/GameRegistry.ts`. `GameRegistry.ts` hardcoded **only the original 7 games**. It returned `undefined`, causing `GameRunner` to construct fallback metadata.
5. **Component Mounting Branch**: In `apps/web/src/components/games/GameRunner.tsx` (lines 473–648):
   ```tsx
   {gameCode === 'read-escape' && <ReadAndEscapeGame ... />}
   {gameCode === 'reading-detective' && <ReadingDetectiveGame ... />}
   {gameCode === 'snake-ladder' && <SnakeAndLadderGame ... />}
   {gameCode === 'email-escape' && <EmailEscapeGame ... />}
   {gameCode === 'inbox-rescue' && <InboxRescueGame ... />}
   {gameCode === 'listening-quest' && <ListeningQuestGame ... />}
   {gameCode === 'pubspeak-arena' && <PubspeakArenaGame ... />}

   {/* Fallback for unrecognized game code */}
   {![
     'read-escape',
     'reading-detective',
     'snake-ladder',
     'email-escape',
     'inbox-rescue',
     'listening-quest',
     'pubspeak-arena',
   ].includes(gameCode) && (
     <ReadAndEscapeGame
       currentQuestion={currentQuestion}
       lives={lives}
       score={score}
       onAnswer={handleAnswer}
       onNextQuestion={handleNextQuestion}
       onFinishGame={handleFinishGame}
     />
   )}
   ```
6. **Defect**: Because `red-flag-pop` (and the other 26 new games) was not in the hardcoded list of 7 games, **`GameRunner` mounted `<ReadAndEscapeGame>` for every single new game**.
7. `<ReadAndEscapeGame>` is the Virtual Lockroom game containing the 3 locks and reading room layout. Thus, **none of the 27 new game components were ever mounted or visible to users.**

---

## 2. Investigation Matrix: Core Questions

| Investigation Question | Finding | Evidence |
| :--- | :--- | :--- |
| **A. Did original games have mechanics lost during integration?** | **Partial.** `apps/new_game/` contains original mechanics (e.g. `synonym-maze` has a 12x12 grid maze with D-pad, `word-sorter` has falling card drag-and-drop, `scenario-spinner` has an SVG wheel). However, several games were still structured around questions. | `apps/new_game/synonym-maze/Game.tsx`, `apps/new_game/word-sorter/Game.tsx` |
| **B. Were original games themselves only quiz interfaces?** | **Yes, for 15+ games.** Many games in `apps/new_game/` simply rendered the question text, a timer ring, and 4 buttons styled with different colors or placed in a 2x2 grid. | `analogy-machine`, `chat-reply`, `compressor`, `debate-champion`, `emotion-switch`, etc. |
| **C. Does GameRunner force all plugins into a common question layout?** | **Yes.** `GameRunner.tsx` possessed a hardcoded top HUD with its own timer loop, lives hearts, and score, plus the hardcoded fallback mounting `ReadAndEscapeGame`. | `apps/web/src/components/games/GameRunner.tsx` |
| **D. Do plugins simply render `currentQuestion.options`?** | **Yes.** In many plugins, `options.map((opt, i) => <button onClick={() => resolve(i)}>{opt}</button>)` was the entire interaction. | `apps/game/*/Game.tsx` |
| **E. Have shared components replaced game-specific gameplay?** | **Yes.** `TimerRing` and generic buttons were used across all 27 new games instead of custom interactive canvases. | `components/TimerRing.tsx` used ubiquitously |
| **F. Are incorrect plugin mappings causing wrong components to render?** | **Yes.** The fallback in `GameRunner.tsx` forced all 27 games to render `ReadAndEscapeGame`. | `GameRunner.tsx#L631-L648` |

---

## 3. Detailed Audit of All 34 Games

### Canonical 7 Games

| # | Slug | Current Implementation | Gameplay Defects | Required Transformation |
| :-: | :--- | :--- | :--- | :--- |
| 1 | `read-escape` | Virtual Lockroom with 3 locks (Detail, Vocab, Inference) and reading room | Works, but right panel is purely 4 radio buttons per lock. Lacks physical lock-picking / cipher interaction. | Enhance lock interface with interactive dial/tumbler animations and clue discovery highlighter. |
| 2 | `reading-detective` | Incident dossier with witness statements & evidence cards | Solid narrative UI, but interrogation boils down to 4 button options. | Add interactive corkboard pinboard, connect clues with thread lines, magnifying glass evidence scanner. |
| 3 | `snake-ladder` | 100-cell board with dice roll & pawn animation | Has real board and token movement! Snake encounters trigger question modal. | Keep core board gameplay. Polish 3D dice roll animation, particle trails on ladders, and snake slide down effect. |
| 4 | `email-escape` | Client escalation email thread + 4 strategy buttons | Mostly an MCQ screen styled like an email client. | Transform into interactive multi-stage email puzzle room: redact dangerous clauses, pin crisis attachments, reconstruct thread order. |
| 5 | `inbox-rescue` | Inbox terminal with hostile email + 4 rewrite options | MCQ disguised as email client. | Interactive inbox triage simulator: drag hostile phrasing to shredder, slot professional replacements into subject/body templates. |
| 6 | `listening-quest` | Audio player waveform + 4 comprehension options | Good waveform visual, but interaction is standard MCQ buttons. | Interactive audio lab: scrub tape playback, pinpoint timestamps of tone shifts, match spoken soundbites to speaker motives. |
| 7 | `pubspeak-arena` | Virtual stage simulator + audience feedback + 4 speech options | Stage visual exists, but speech delivery is just clicking an answer button. | Real keynote stage: audience meter reacts dynamically, teleprompter speech flow, pacing slider, defuse hostile hecklers. |

---

### Newly Integrated 27 Game Plugins

| # | Slug | Current Source State | Defect Classification | Required Transformation |
| :-: | :--- | :--- | :--- | :--- |
| 8 | `analogy-machine` | 2 objects shown; 4 text options in 2x2 grid | Quiz Disguise | Interactive mechanical slot/gear machine: pull lever, align rotating cogs, connect concept gears to complete analogy circuit. |
| 9 | `chat-reply` | Slack-like message box; 4 reply buttons | Quiz Disguise | Animated messaging simulator: real-time typing indicators, incoming bubbles, speech bubble composer, dynamic sentiment gauge. |
| 10 | `compressor` | Full message shown; 4 compressed options | Quiz Disguise | Interactive text condenser: clickable word blocks to strike out filler words, live word-count compression meter, semantic preservation bar. |
| 11 | `debate-champion` | Two speaker names; 4 argument buttons | Quiz Disguise | Animated debate arena: opponent podium, audience momentum tug-of-war meter, construct opening/rebuttal/closing by slotting evidence blocks. |
| 12 | `emotion-switch` | Expressive emotion prompt; 4 response buttons | Quiz Disguise | Dynamic character avatar with reactive face morphing (SVG), empathy dial, select and observe immediate emotional shift on avatar. |
| 13 | `explain-to-a-child` | Concept prompt; 4 simplified options | Quiz Disguise | Interactive classroom simulator: animated child character with thought bubble (confused ❓ -> curious 💡 -> understanding ⭐), jargon detector. |
| 14 | `filler-free` | Audio prompt; 4 speech options | Quiz Disguise | Speaking challenge: live browser microphone input with Web Speech API detection of "um", "uh", "like", "actually", with accessible pacing fallback. |
| 15 | `framework-master` | Framework prompt; 4 placement buttons | Quiz Disguise | Interactive diagram builder: drag & drop framework nodes (e.g. STAR, Pyramid, SCQA) into visual slots with animated connection lines. |
| 16 | `impossible-questions` | Dilemma card; 4 choice buttons | Quiz Disguise | High-stakes crisis pressure room: ticking hazard timer, split-second triage cards, consequences branching graph. |
| 17 | `letter-shuffle` | Scrambled letters in text; 4 word options | Quiz Disguise | Draggable letter tiles on visual wooden/neon rack, keyboard type-to-place, shake animation for invalid anagrams, snap-to-slot. |
| 18 | `lie-detector` | Statement dossier; 4 truth/lie buttons | Quiz Disguise | Forensic credibility analyzer: interactive polygraph needle, highlight contradicting clauses in testimony with investigation marker. |
| 19 | `link-up` | Concepts list; 4 connection options | Quiz Disguise | Node-graph puzzle: click & drag SVG connection cords between related concepts, glowing circuit nodes when match is validated. |
| 20 | `memory-vault` | Flashes cards then shows 4 sequence buttons | Weak Mechanics | Animated bank vault: vault door reveals pattern/order of items, door closes, player reconstructs combination sequence by clicking safe dials. |
| 21 | `mood-match` | Emotion cards; 4 matching buttons | Quiz Disguise | Emotional intelligence card matching: animated character expressions paired with workplace crisis cards via drag-to-match. |
| 22 | `red-flag-pop` | 4 balloon buttons in 2x2 grid moving up | Weak Balloon Mechanics | **PRIORITY GAME**: Interactive workplace arena. Floating balloons/bubbles drift across screen containing behaviors. Player taps/clicks to POP genuine red flags with confetti/burst particles, combo multiplier, hazard spikes. |
| 23 | `scenario-spinner` | SVG wheel spins then shows 4 question buttons | Surface Polish | Interactive prize wheel: player drags/flicks wheel to spin, pointer lands on scenario, launches interactive choice branching card. |
| 24 | `slide-karaoke` | Slide shown; 4 speech choice buttons | Quiz Disguise | Presentation improvisation lab: slide projector changes visuals, speaking timer with teleprompter cues, pacing meter. |
| 25 | `slides-from-hell` | Flawed slide text; 4 fix options | Quiz Disguise | Slide doctor workshop: interactive slide canvas with faulty elements (cluttered text, bad contrast), click to patch flaw with visual before/after. |
| 26 | `speech-roulette` | Roulette wheel spins to select topic; 4 options | Surface Polish | Casino-style topic roulette: spinning ball, betting chips on speaking styles, timed speech delivery with pacing analyzer. |
| 27 | `spell-express` | Word prompt; 4 spelling options | Quiz Disguise | Moving train express: train cars roll across tracks carrying letter crates. Player drops letters into cars before train leaves station. |
| 28 | `story-spark` | Narrative prompt; 4 story options | Quiz Disguise | Visual story weaver: drag character, setting, and plot twist cards onto narrative timeline board to generate coherent story arc. |
| 29 | `style-sorter` | Falling card; 4 category bins | Partial Mechanics | Conveyor sorting facility: incoming communication cards on conveyor belt, drag & drop into Formal, Casual, Assertive, Empathic bins with chute animations. |
| 30 | `synonym-maze` | 12x12 grid maze with D-pad & chaser alarm | Real Mechanics (Unmounted) | 100% genuine maze gameplay! Mount properly in `GameRunner`, polish retro arcade graphics, particle footsteps, sound effects. |
| 31 | `table-topics` | Card deck prompt; 4 response buttons | Quiz Disguise | Virtual Toastmasters stage: flip 3D card from deck, stage spotlights illuminate podium, delivery timer with audience engagement meter. |
| 32 | `word-match-rush` | Word prompt; 4 match options | Quiz Disguise | Fast-paced tile match arcade: grid of word tiles, click pairs under blitz countdown, cascade combos with score popups. |
| 33 | `word-sorter` | Falling card; 4 bins | Partial Mechanics | Mechanical sorting room: physics-driven card drop, drag & drop bins, conveyor speed increase per tier. |
| 34 | `writewise-challenge` | Writing prompt; 4 rewrite buttons | Quiz Disguise | Interactive editorial desk: red-pen markup tool, strike through grammar errors, drag sentence fragments into syntactic hierarchy. |

---

## 4. Architectural Fix Strategy

1. **Fix `GameRegistry.ts`**:
   - Merge all 34 games into `GAME_REGISTRY` so that every game has rich metadata (title, category, duration, XP, instruction steps, theme color).
2. **Fix `GameRunner.tsx` Dynamic Mounting**:
   - Import `DISCOVERED_PLUGINS` from `@games`.
   - Instead of hardcoding 7 `if (gameCode === ...)` statements and falling back to `ReadAndEscapeGame`, dynamically lookup `DISCOVERED_PLUGINS[gameCode]`.
   - If found, render `<Plugin.component {...gameProps} />` inside `React.Suspense` with an adaptive loading chamber.
   - For legacy canonical games (`read-escape`, `reading-detective`, `snake-ladder`), preserve their direct components or route through their respective plugin wrappers.
3. **Re-engineer Game Plugins**:
   - Upgrade games to dedicated interactive visual play areas with physics, drag/drop, canvas/SVG, particle effects, and sound.
   - Keep authoritative server scoring intact via `props.submitAnswer(optionIndex, responseTimeMs)`.
   - Keep EEDI parameter evaluation intact.

