# Session History: Reactor Logic Three.js Game Prompt

## 1. User Request

> design and build a coding agent prompt for a 3d three.js html5 game that teaches logic and beginning code concepts by having players drag logic blocks into a list to execute on the right hand side of a maze on the left that contains a robot - the goal is to find the least amount of blocks to use to get the robot to the goal - support concepts like if/then and loops - the overall story line is the japan nuclear power plant disaster - we are inside the compromised reactor and we need to get the robot to the hot spots and release chemicals to counteract the radiation. we need an overhead view mini map and onscreen display of time to full meltdown and accumulated and reduced radiation levels. ask me questions to clarify before we make the final prompt

---

## 2. Assistant Response: Clarifying Questions

Before I build the final coding-agent prompt, I need a few decisions from you.

1. **Historical framing**
   
   Should the game explicitly reference **Fukushima Daiichi**, or should it be a **fictional Japanese coastal nuclear plant inspired by the 2011 disaster**?

2. **Tone**
   
   Do you want the game to feel:
   
   A. Serious educational simulation  
   B. Sci-fi rescue adventure  
   C. Arcade puzzle game with disaster backdrop  
   D. Dark, tense, but still age-appropriate

3. **Target age / learner level**
   
   Who is this for?

   For example: ages 8 to 12, high school beginners, adult coding beginners, STEM outreach, classroom demo, corporate training, etc.

4. **Coding concepts**
   
   Which beginner concepts should be included in the first version?

   Possible set:
   
   - Move forward
   - Turn left / turn right
   - Repeat loop
   - If wall ahead, then turn
   - If radiation hotspot detected, then deploy chemical
   - While not at goal
   - Functions / procedures
   - Variables such as radiation level or coolant remaining

5. **Block system style**
   
   Should the blocks look like **Scratch-style puzzle blocks**, simple rectangular command cards, or futuristic control modules?

6. **Execution model**
   
   When the player presses “Run,” should the robot:
   
   A. Execute the full command list automatically  
   B. Execute one block at a time with a “Step” button  
   C. Support both “Run” and “Step”  
   D. Show a live code translation beside the blocks

7. **Programming language preview**
   
   Should the game show the equivalent code in:
   
   - JavaScript
   - Python-like pseudocode
   - Plain English
   - No text-code preview yet

8. **Maze view**
   
   Should the maze be:
   
   A. True 3D overhead/isometric  
   B. Mostly top-down 2.5D  
   C. Fully 3D with camera controls  
   D. Fixed overhead camera only

9. **Robot movement**
   
   Should the robot move on a square grid, or should it move freely through a 3D maze?

   For beginner logic games, a grid is usually better because “move forward,” “turn left,” and “repeat” become crisp and teachable.

10. **Win condition**
   
   Is the goal simply to reach the exit, or should each level require the robot to:
   
   - Visit all radiation hotspots
   - Deploy chemicals at each hotspot
   - Then reach the extraction zone
   - Use the fewest possible blocks

11. **Scoring**
   
   Should the final score prioritize:
   
   A. Fewest blocks  
   B. Fastest completion time  
   C. Radiation reduction  
   D. Fewest errors  
   E. A combined star rating

12. **Meltdown timer**
   
   Should “time to full meltdown” count down in real time, or should it decrease per robot action / block execution?

   A turn-based countdown may be better for learning because players are not punished while thinking.

13. **Radiation system**
   
   Should accumulated radiation be:
   
   - A simple number that increases near hotspots
   - Zone-based: green/yellow/red tiles
   - A robot health meter
   - A plant-wide radiation meter reduced by deploying chemicals

14. **Chemical mechanic**
   
   What should the “release chemicals” action represent?

   Options:
   
   - Generic neutralizing foam
   - Borated coolant
   - Radiation suppressant capsule
   - Fictional “RadFoam” for game simplicity
   - Something more scientifically grounded

15. **Level design**
   
   How many levels should the first prototype include?

   For example:
   
   - 1 tutorial level only
   - 3 levels: movement, loops, if/then
   - 5 levels with increasing complexity
   - Procedurally generated mazes

16. **UI layout**
   
   You described maze on the left and block list on the right. Should the layout be:

   Left: 3D maze  
   Right: draggable blocks and command queue  
   Top: meltdown timer and radiation HUD  
   Bottom or corner: minimap

   Or do you want a different layout?

17. **Mini-map**
   
   Should the overhead minimap reveal the whole maze, or only areas the robot has explored?

18. **Failure conditions**
   
   Should the player fail if:

   - Meltdown timer reaches zero
   - Robot enters lethal radiation
   - Robot runs into too many walls
   - Uses too many blocks
   - Runs out of chemical payloads

19. **Code deliverable**
   
   Should the coding agent be asked to generate:
   
   A. A single self-contained `index.html` file  
   B. Separate `index.html`, `style.css`, and `main.js` files  
   C. A Vite / npm Three.js project  
   D. A React + Three.js project

20. **Libraries**
   
   Should the prompt allow external libraries?

   For example:
   
   - Three.js from CDN
   - No other libraries
   - Use a drag-and-drop library
   - Use only native HTML5 drag/drop

21. **Art direction**
   
   What visual style do you want?

   - Clean educational
   - Low-poly industrial
   - Neon sci-fi reactor
   - Realistic nuclear plant interior
   - Stylized Japanese disaster-response robot theme

22. **Sensitivity**
   
   Since this is based on a real disaster, should the final prompt instruct the coding agent to avoid showing human suffering, casualties, political blame, or sensational imagery?

23. **Narrative**
   
   Should the story be short and functional, or should it include mission briefings, dialogue, and named robot characters?

24. **Robot identity**
   
   Should the robot have a name? For example, something neutral like **Unit R-7**, or something more characterful.

25. **Prototype quality**
   
   Do you want the coding agent prompt to aim for:
   
   A. Fast playable proof of concept  
   B. Polished classroom demo  
   C. Expandable game architecture  
   D. Production-grade modular code

My recommended defaults, unless you choose otherwise: fictional plant inspired by Fukushima, serious but non-sensational tone, grid-based 2.5D Three.js maze, native drag-and-drop blocks, single `index.html` prototype, three tutorial levels, turn-based meltdown timer, Scratch-like blocks, and code preview in JavaScript.

---

## 3. User Clarifications

> 1 - fictional 2 - c 3 - high school beginner 4 - those are all good start but make sure we can add more easily 5 - control modules but not too futuristic - like a simplified real service interface 6 - c and d 7 - python like 8 - between a and b - what ever is easiest to execute 9 - grid 10 - goal for each level is to visit all spots and deploy chems and then reach extraction zone - bonus points will be calculated based on the numbers of mover - less is more points 11 - e 12 - yes turn based 13 - plant wide 14 - foam 15 - procedural generated 16 - mini map should be on right above the commands list but fairly small 17 - whole maze but it can be scrolling wiht the roboto movements 18 - no impact of radiation on robot - less blocks is just a bonus not a requirment - the others create failures 19 - d but not vite just react typescript 20 - allow libs 21 -  Stylized Japanese disaster-response robot theme 22 - correct do not show th4se things 23 - short 24 - yes - in fact lets have 3 different robots for the player to choose - each has it's own strengths and limitations 25 - c

---

## 4. Assistant Response: Final Coding-Agent Prompt

Here is a copy-ready coding-agent prompt.

```text
You are a senior React, TypeScript, and Three.js game engineer. Build an expandable browser game prototype called “Reactor Logic: Foam Run.”

The game teaches high-school beginners logic and early coding concepts through a 3D/2.5D maze puzzle. The player chooses a disaster-response robot, drags programming blocks into a command list, previews the equivalent Python-like pseudocode, then runs or steps through the program to guide the robot through a compromised fictional Japanese coastal reactor facility.

Important: This is a fictional scenario inspired by emergency-response robotics. Do not reference Fukushima Daiichi directly. Do not show human suffering, casualties, political blame, sensational explosions, real victims, or graphic disaster imagery. Keep the tone arcade-puzzle, educational, and age-appropriate. The neutralizing foam is fictional “stabilizing foam” for gameplay purposes, not a claim about real nuclear cleanup.

Core concept

The screen is split into two main zones:

Left side:
A Three.js 3D/2.5D overhead maze scene with a grid-based robot inside a stylized reactor service corridor.

Right side:
A compact minimap at the top, then the drag-and-drop coding interface below it.

Top HUD:
Show mission status and key numbers:
- Turn-based time to full meltdown
- Current plant-wide radiation level
- Total radiation reduced
- Foam charges remaining
- Movement/actions used
- Blocks used
- Wall collision count
- Hotspots sealed / total hotspots

The player’s goal for each level:
1. Visit all radiation hotspots.
2. Deploy stabilizing foam on every hotspot.
3. Reach the extraction zone.
4. Use as few movement/actions and blocks as possible for bonus points.

Using fewer blocks or movement actions should improve the score, but it should not be required to win.

Failure conditions:
- Meltdown timer reaches zero.
- Robot runs into too many walls.
- Robot runs out of foam before all hotspots can be sealed.
- Program hits an infinite-loop safety cap.
- Robot reaches extraction before sealing all hotspots, which should count as incomplete/failure or force the mission to continue.

Radiation should not damage the robot. Radiation is plant-wide only.

Technical requirements

Use:
- React
- TypeScript
- Three.js
- It is acceptable to use @react-three/fiber and @react-three/drei.
- It is acceptable to use a drag-and-drop library such as dnd-kit.
- Do not use Vite.
- If creating a full project scaffold, use a plain React + TypeScript setup with Webpack 5.

Provide a complete runnable project with a clear file structure, for example:

package.json
webpack.config.js
tsconfig.json
public/index.html
src/index.tsx
src/App.tsx
src/styles.css
src/game/types.ts
src/game/mazeGenerator.ts
src/game/interpreter.ts
src/game/scoring.ts
src/game/robots.ts
src/game/blocks.ts
src/components/GameScene.tsx
src/components/HUD.tsx
src/components/MiniMap.tsx
src/components/BlockPalette.tsx
src/components/ProgramEditor.tsx
src/components/CodePreview.tsx
src/components/RobotSelect.tsx
src/components/MissionBriefing.tsx

The project must run with:
npm install
npm start

Use primitive geometry and CSS rather than external image assets. Keep performance reasonable.

Visual style

Create a stylized Japanese disaster-response robot theme:
- Industrial reactor service corridors
- Grid floor tiles
- Low-poly walls, pipes, vents, warning stripes, service lights
- Hotspots as glowing hazard tiles or leaking-energy markers
- Extraction zone as a marked service hatch or platform
- Robots as simple but recognizable 3D units made from primitive shapes

Camera:
Use an orthographic overhead/isometric camera. It can be mostly top-down with slight angle, whichever is easiest to implement cleanly. Movement must be grid-based.

Minimap:
Place the minimap on the right side above the command/program list. It should be fairly small. Show the whole maze if possible, but it may be robot-centered and scroll/focus as the robot moves. Show:
- Maze walls
- Robot position
- Hotspots
- Sealed hotspots
- Extraction zone
- Optional path trace

Game story

Keep the narrative short and functional.

Suggested fictional setting:
“Kuroshio Coastal Research Reactor is in emergency containment mode after a severe coastal systems failure. Human teams cannot enter the service maze, so three response robots are deployed. Your task is to program one robot to seal radiation hotspots with stabilizing foam and reach the extraction zone before the reactor reaches full meltdown.”

Include this as a short mission briefing screen or panel. Avoid melodrama.

Robot selection

Before a mission, the player chooses one of three robots. Each robot should have visible strengths and limitations.

Implement these robots as configurable data in src/game/robots.ts so more robots can be added easily.

Robot 1: Kumo Scout
- Strength: fastest and most efficient
- Starts with +10 meltdown ticks
- Normal foam strength
- Normal foam capacity
- Limitation: low wall-hit tolerance
- Suggested config:
  - moveCost: 1
  - turnCost: 1
  - deployCost: 1
  - extraMeltdownTicks: 10
  - extraFoamCharges: 0
  - foamEffectMultiplier: 1.0
  - wallHitLimit: 2
  - scoreMultiplier: 1.05

Robot 2: Tancho Carrier
- Strength: carries more foam and reduces more radiation
- Limitation: heavier, slower
- Suggested config:
  - moveCost: 2
  - turnCost: 1
  - deployCost: 1
  - extraMeltdownTicks: 0
  - extraFoamCharges: 2
  - foamEffectMultiplier: 1.25
  - wallHitLimit: 3
  - scoreMultiplier: 1.0

Robot 3: Sora Mapper
- Strength: safest for learning and debugging
- Shows enhanced sensor hints
- Has higher wall-hit tolerance
- Limitation: slightly weaker foam or lower score multiplier
- Suggested config:
  - moveCost: 1
  - turnCost: 1
  - deployCost: 1
  - extraMeltdownTicks: 0
  - extraFoamCharges: 0
  - foamEffectMultiplier: 0.9
  - wallHitLimit: 5
  - sensorHints: true
  - scoreMultiplier: 0.95

Show robot stats in plain language before selection.

Procedural maze generation

Implement procedural levels.

Requirements:
- Grid-based maze.
- Seeded random generation so levels can be replayed.
- Generate solvable mazes.
- Place the robot start, multiple hotspots, and extraction zone.
- Ensure all hotspots and extraction are reachable.
- Difficulty should scale by:
  - Maze size
  - Number of hotspots
  - Meltdown timer
  - Wall-hit limit
  - Hotspot radiation values
  - Available foam charges
- Each level should have enough foam charges to seal all hotspots if used correctly.
- Avoid impossible layouts.

Recommended generation approach:
- Use a seeded PRNG.
- Use recursive backtracking, randomized DFS, or another simple maze-generation algorithm.
- After generating the maze, use BFS to confirm reachability.
- Place hotspots along reachable paths.
- Place extraction far from the start or after likely hotspot routes.
- Compute an approximate optimal path length using BFS over “visit all hotspots then extraction” states. Use this to create par movement/action values for scoring.

Game state

Track:
- Current level seed
- Maze grid
- Robot position and facing direction
- Selected robot config
- Program blocks
- Procedure definitions
- Variables
- Hotspots and sealed state
- Foam charges remaining
- Meltdown ticks remaining
- Plant radiation level
- Radiation reduced
- Movement/action count
- Blocks used
- Wall hit count
- Mission log
- Execution state: idle, running, stepping, paused, success, failed

Turn-based meltdown system:
The meltdown timer does not decrease while the player is thinking. It decreases only when robot commands execute. Each primitive action costs meltdown ticks based on the selected robot config.

Examples:
- moveForward costs robot.moveCost
- turnLeft costs robot.turnCost
- turnRight costs robot.turnCost
- deployFoam costs robot.deployCost
- Sensor checks and conditions should usually cost 0 unless you decide otherwise.

Radiation system

Use plant-wide radiation only.

Suggested model:
- Each hotspot has a radiationValue.
- Plant radiation starts at a base value plus the sum of hotspot values.
- Each executed primitive action may increase plant radiation slightly, for example +1.
- Deploying foam on an unsealed hotspot reduces plant radiation by hotspot.radiationValue * robot.foamEffectMultiplier.
- Track total radiation reduced separately.
- Deploying foam on a non-hotspot tile should waste one foam charge and log a warning. If this makes it impossible to seal all hotspots, the mission should fail.
- Radiation never damages the robot.

Programming block system

The game teaches beginner code concepts through draggable “control module” blocks. The blocks should look like simplified real service-interface modules, not overly futuristic toys. Use readable labels, compact shapes, and clear icons if helpful.

The system must be extensible. Define block types in a registry so new blocks can be added without rewriting the interpreter.

At minimum, implement these block types:

Basic movement:
- Move Forward
- Turn Left
- Turn Right
- Deploy Foam

Logic:
- If condition then
- If condition then else, optional but preferred
- Repeat N times
- While condition
- Define Procedure
- Call Procedure

Variables:
- Built-in read-only variables:
  - foam_remaining
  - radiation_level
  - hotspots_left
  - actions_used
  - wall_hits
- At least one simple user variable, such as counter
- Blocks for:
  - Set counter to number
  - Increase counter by number
  - If counter comparison then

Conditions:
- wall_ahead()
- on_hotspot()
- hotspot_ahead()
- at_extraction()
- foam_remaining > 0
- hotspots_left > 0
- radiation_level > threshold
- counter comparison, such as counter < 3

Interpreter requirements:
- Execute the player’s block program.
- Support nested blocks.
- Support Run mode.
- Support Step mode.
- Support Pause and Reset.
- Animate robot movement between grid cells.
- Log each executed command.
- Prevent infinite loops with a max instruction count.
- Show friendly errors, for example:
  - “Wall ahead. Kumo Scout bumped the wall.”
  - “No foam remaining.”
  - “Loop safety limit reached. Check your while condition.”
  - “Extraction reached, but 2 hotspots remain.”

Execution model

Provide both:
- Run button: executes the full program with animation.
- Step button: executes one primitive command at a time.
- Pause button.
- Reset robot button.
- Reset level button.
- New procedural level button.
- Optional seed input for debugging/replay.

Python-like pseudocode preview

Show a live code preview beside or below the blocks. This preview should update as blocks are added, removed, nested, or reordered.

Example style:

def routine_a():
    repeat 3:
        move_forward()
    turn_right()

while hotspots_left > 0:
    if on_hotspot():
        deploy_foam()
    if wall_ahead():
        turn_right()
    else:
        move_forward()

call routine_a()

Use Python-like syntax, not JavaScript. This is for learning only.

Drag-and-drop UI

Implement:
- A Block Palette with available control modules.
- A Program Editor list where blocks are dragged.
- Nested drop zones for Repeat, While, If, Else, and Procedure blocks.
- Reorder blocks by dragging.
- Delete/remove blocks.
- Duplicate blocks if easy.
- Editable parameters:
  - Repeat count
  - Variable value
  - Comparison operator
  - Condition type
  - Procedure name, if supported

If fully nested drag-and-drop is too complex for the first pass, implement a reliable simplified nested editor rather than a broken advanced one. Functionality matters more than visual cleverness.

Scoring

Create a combined star rating.

Score should consider:
- Mission success
- Radiation reduced
- Remaining meltdown ticks
- Fewer movement/actions
- Fewer blocks used
- Fewer wall hits
- Correct foam use
- Robot score multiplier

Less movement is better. Less block usage is better. These are bonuses, not hard requirements.

Display the score breakdown after success:
- Mission complete
- Hotspots sealed
- Radiation reduced
- Actions used versus par
- Blocks used
- Meltdown ticks remaining
- Wall hits
- Star rating from 1 to 5

Use the procedural solver’s approximate optimal route to determine par actions. Do not require a mathematically perfect optimal solution.

Educational features

Include lightweight teaching support:
- Tooltip or small help text for each block.
- A “Concept” note when the player unlocks or uses loops, if/then, while, procedures, or variables.
- Show why Step mode is useful.
- Highlight the current executing block.
- Show robot sensor values if Sora Mapper is selected.
- Use beginner-friendly labels.

Suggested level progression despite procedural generation:
- Level 1: movement and turning
- Level 2: deploy foam
- Level 3: repeat loops
- Level 4: if wall ahead
- Level 5: while hotspots left
- Level 6+: procedures and variables

The levels should still be procedural, but difficulty and required concepts should scale.

Three.js scene details

Use @react-three/fiber if helpful.

Scene should include:
- Orthographic camera
- Grid floor
- Wall blocks
- Robot model made from primitives
- Hotspots with animated glow
- Foam effect when deployed
- Extraction platform
- Direction indicator on the robot
- Simple lighting
- Smooth robot movement animation
- Optional floating labels for hotspots and extraction

Keep the robot’s logical position snapped to grid coordinates even if animation interpolates visually.

Architecture requirements

Make the code modular and expandable.

Use TypeScript types for:
- Direction
- Position
- Cell
- Maze
- Hotspot
- RobotConfig
- GameState
- BlockDefinition
- ProgramBlock
- ExecutionFrame
- InterpreterResult
- ScoreResult

The block system should be registry-based. Each block definition should include:
- type
- label
- category
- default parameters
- whether it has child blocks
- interpreter behavior
- pseudocode rendering function
- UI description/help text

Example conceptual shape:

type BlockDefinition = {
  type: string;
  label: string;
  category: "movement" | "logic" | "loop" | "procedure" | "variable";
  createDefaultBlock: () => ProgramBlock;
  toPseudoCode: (block: ProgramBlock, context: CodeGenContext) => string[];
};

Keep interpreter logic separate from React components.

Acceptance criteria

The finished prototype must:
- Compile without TypeScript errors.
- Run in the browser.
- Show a 3D/2.5D maze on the left.
- Show a compact minimap above the command list on the right.
- Let the player choose between three robots.
- Generate solvable procedural levels.
- Let the player drag blocks into a command list.
- Support nested repeat and if/then blocks at minimum.
- Preferably support while, procedures, and simple variables.
- Show live Python-like pseudocode.
- Support Run and Step execution.
- Animate the robot moving through the grid.
- Allow deploying foam on hotspots.
- Track meltdown timer, plant radiation, radiation reduced, foam, actions, blocks, wall hits, and hotspots.
- End with success only after all hotspots are sealed and the robot reaches extraction.
- Show scoring with star rating.
- Include clear reset/retry controls.
- Include no real-world disaster gore, victims, blame, or sensational imagery.

Implementation priorities

Prioritize in this order:
1. Reliable game loop and interpreter.
2. Grid movement and procedural solvable maze.
3. Drag-and-drop program editor.
4. Run and Step execution.
5. HUD, minimap, scoring.
6. Robot selection.
7. Three.js visual polish.
8. Advanced blocks such as procedures and variables.

If a choice must be made, choose a stable, playable, expandable prototype over a visually elaborate but fragile implementation.

Deliver the full code, not just a description. Include run instructions and a brief explanation of how to add new blocks, robots, and level rules.
```

A useful addition for the coding agent would be: “After building the first version, include one sample seed that demonstrates loops and if/then clearly.” This helps you test whether the teaching mechanic works instead of getting a random maze that solves too easily.

---

## 5. Current User Request

> give me a complete history of this session in a md file i can download

---

## 6. Notes

This downloadable Markdown file was created in response to the current request. It captures the visible session transcript and the completed coding-agent prompt.
