import type { RoadmapDomain } from './types'

export const electronicsDomain: RoadmapDomain = {
  id: 'electronics',
  title: 'Electronics / Electrical',
  shortLabel: 'Electronics',
  description: 'Analyze circuits, design reliable digital and embedded systems, and reason about feedback control.',
  accent: '#8b5cf6',
  topics: [
    {
      id: 'circuit-analysis',
      title: 'Circuit analysis and power',
      summary: 'Use Kirchhoff laws, equivalent circuits, and impedance to predict voltages, currents, and power.',
      estimatedMinutes: 40,
      notes: [
        'Kirchhoff current law says currents entering a node equal currents leaving it; Kirchhoff voltage law says voltage drops around a closed loop sum to zero. These laws plus component relationships are enough to solve linear circuits systematically.',
        'Thevenin and Norton equivalents reduce a linear network to a source and a single impedance as seen from two terminals. They simplify load analysis and make maximum-power-transfer reasoning clearer. The equivalent is valid only for the terminals and operating region used to derive it.',
        'In AC circuits, capacitors and inductors have frequency-dependent impedance. Phasors convert sinusoidal steady-state equations into complex algebra. Real power does work, reactive power exchanges energy, and apparent power is their vector combination.',
        'Resistor power is I^2R or V^2/R. Always check component ratings, including transient and startup conditions. A correct nominal voltage can still exceed a power or temperature limit in service.',
      ],
      example: {
        title: 'Voltage divider',
        body: 'Two resistors, 10 kΩ and 20 kΩ, are connected across 12 V. The output across the 20 kΩ resistor is 12 × 20/(10 + 20) = 8 V when nothing else loads the node. Connecting a low-resistance load changes the divider because the load is now in parallel with the lower resistor, so the unloaded formula is not sufficient.',
      },
      practice: [
        {
          id: 'thevenin-use',
          prompt: 'What is a Thevenin equivalent useful for?',
          difficulty: 'Easy',
          answer: 'It reduces a linear network to one voltage source and one series resistance so the effect of different loads can be analyzed simply.',
          explanation: 'The equivalent preserves the terminal voltage-current relationship over the linear operating range. It cannot capture nonlinear components or different operating regions.',
        },
        {
          id: 'resistor-power',
          prompt: 'A 100 Ω resistor has 20 mA through it. What power does it dissipate?',
          difficulty: 'Easy',
          answer: 'P = I^2R = (0.020)^2 × 100 = 0.04 W, or 40 mW.',
          explanation: 'Use a resistor rated above the expected worst-case dissipation with margin for temperature and tolerance. The nominal calculation alone is not a reliability check.',
        },
      ],
    },
    {
      id: 'digital-electronics',
      title: 'Digital electronics and timing',
      summary: 'Move from Boolean logic to synchronous state machines and the timing rules that make them reliable.',
      estimatedMinutes: 40,
      notes: [
        'Combinational logic outputs depend only on current inputs. Sequential logic stores state in flip-flops or registers, so outputs can depend on past inputs. A synchronous design updates state on a clock edge and keeps combinational logic between registers.',
        'Setup time is the interval before the clock edge during which data must be stable; hold time is the interval after the edge. Violating either can produce metastability. Clock skew, propagation delay, and jitter reduce the available timing margin.',
        'A finite-state machine is defined by states, inputs, outputs, and transition rules. Draw the state diagram first, then derive the next-state and output logic. Add a defined reset state so hardware starts deterministically.',
        'Binary arithmetic, multiplexers, decoders, and counters are building blocks rather than isolated facts. Know how a counter wraps, how an adder carries, and how a register enables data capture.',
      ],
      example: {
        title: 'Modulo-6 counter',
        body: 'A 3-bit synchronous counter naturally counts 0 to 7. To count 0 to 5, detect state 6 and assert synchronous reset on the next clock edge, returning to 0. Detection must use the current registered state, not a combinational value that can glitch. The result is a stable divide-by-6 sequence.',
      },
      practice: [
        {
          id: 'setup-hold',
          prompt: 'What happens if a flip-flop setup or hold time is violated?',
          difficulty: 'Medium',
          answer: 'The flip-flop may capture an invalid or unstable value, producing metastability that can propagate into the circuit.',
          explanation: 'Synchronous design budgets propagation delay, skew, and jitter so data is stable around the active clock edge. Metastability is a physical timing failure, not a logic-value error that can be ignored.',
        },
        {
          id: 'combinational-vs-sequential',
          prompt: 'What distinguishes a sequential circuit from a combinational one?',
          difficulty: 'Easy',
          answer: 'A sequential circuit has memory: its output can depend on previous inputs as well as current inputs, while a combinational circuit depends only on the present inputs.',
          explanation: 'Registers and feedback create state. Clocking makes state changes predictable and allows complex behavior such as counters and protocol controllers.',
        },
      ],
    },
    {
      id: 'embedded-systems',
      title: 'Embedded systems and firmware',
      summary: 'Design microcontroller-based systems with predictable I/O, interrupts, communication, and power behavior.',
      estimatedMinutes: 45,
      notes: [
        'A microcontroller integrates a processor, memory, and peripherals. GPIO pins are configured for input or output and often have alternate functions for timers, serial buses, or analog peripherals. Always respect voltage and current limits.',
        'Polling repeatedly checks a device; interrupts let hardware signal the processor when an event occurs. Interrupt handlers should be short: read or clear the event, set a flag, and defer heavy work to the main loop. Shared variables need safe access or atomic updates.',
        'UART is asynchronous and point-to-point; SPI is fast and uses separate clock and data lines with chip selects; I2C uses two wires and addressed devices. Choose based on distance, speed, pin count, and multi-device requirements.',
        'Watchdogs recover from firmware lockups, but they must be serviced only when the system is genuinely healthy. Low-power design uses sleep modes, disabled peripherals, and event-driven wakeups. Measure current in each mode rather than assuming.',
      ],
      example: {
        title: 'Debouncing a button in firmware',
        body: 'A mechanical button can produce several transitions in a few milliseconds. An interrupt can timestamp or flag the first edge, but the main loop should confirm that the input remains stable for a defined debounce interval before accepting the press. This avoids treating contact bounce as multiple user actions.',
      },
      practice: [
        {
          id: 'isr-short',
          prompt: 'Why should an interrupt service routine usually be short?',
          difficulty: 'Easy',
          answer: 'It delays other interrupts and the main loop, and long handlers increase latency and the risk of missed events or priority inversion.',
          explanation: 'The handler should acknowledge the hardware and record minimal state. Longer processing belongs in the main loop or a task that can be scheduled predictably.',
        },
        {
          id: 'spi-vs-i2c',
          prompt: 'Give one advantage of SPI over I2C and one advantage of I2C over SPI.',
          difficulty: 'Medium',
          answer: 'SPI is generally faster and full-duplex; I2C uses fewer pins and supports multiple addressed devices on a shared bus.',
          explanation: 'SPI needs more pins and a chip select per device. I2C is slower and has bus capacitance and addressing constraints, but it is convenient for low-pin-count sensor networks.',
        },
      ],
    },
    {
      id: 'control-systems',
      title: 'Feedback and control systems',
      summary: 'Understand how feedback changes behavior, how PID terms act, and what stability margins tell you.',
      estimatedMinutes: 40,
      notes: [
        'Open-loop control applies an input without checking the result. Closed-loop control measures the output and adjusts the input based on error. Feedback reduces sensitivity to disturbances and model error but can also cause oscillation or instability if not designed carefully.',
        'Proportional action responds to current error. Integral action accumulates past error and removes steady-state offset. Derivative action responds to the rate of change and can improve damping, but it amplifies noise and is often filtered.',
        'Stability means bounded inputs produce bounded outputs and disturbances decay. Gain and phase margins from a Bode plot indicate how much additional gain or phase shift the loop can tolerate before instability. A system can be stable but still have poor damping or excessive overshoot.',
        'Digital control adds sampling and delay. The sample rate must be fast enough for the dynamics of interest, and aliasing can make high-frequency noise appear as low-frequency error. Anti-windup prevents an integral term from accumulating while an actuator is saturated.',
      ],
      example: {
        title: 'Why integral action removes offset',
        body: 'A proportional controller may settle with a small error because a nonzero error is required to produce the corrective output. An integral term keeps accumulating that error, increasing the output until the error reaches zero. The trade-off is slower recovery and possible overshoot, so anti-windup and tuning are required.',
      },
      practice: [
        {
          id: 'derivative-noise',
          prompt: 'Why must derivative action be used carefully in a noisy system?',
          difficulty: 'Medium',
          answer: 'Differentiation amplifies high-frequency changes, so sensor noise can create large, rapid control outputs and wear actuators.',
          explanation: 'Practical controllers filter the derivative or use a modest derivative gain. The benefit is improved damping, but the cost is sensitivity to noise and sampling effects.',
        },
        {
          id: 'gain-margin',
          prompt: 'What does gain margin indicate about a feedback loop?',
          difficulty: 'Medium',
          answer: 'It indicates how much the loop gain can increase before the closed-loop system becomes unstable at the frequency where phase reaches -180 degrees.',
          explanation: 'It is a robustness measure, not the same as steady-state accuracy. A loop can have large gain margin but still respond poorly if its phase margin or bandwidth is inadequate.',
        },
      ],
    },
  ],
}
