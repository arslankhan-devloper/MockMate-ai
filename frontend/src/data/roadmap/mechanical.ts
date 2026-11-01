import type { RoadmapDomain } from './types'

export const mechanicalDomain: RoadmapDomain = {
  id: 'mechanical',
  title: 'Mechanical Engineering',
  shortLabel: 'Mechanical',
  description: 'Connect thermodynamic, fluid, structural, and manufacturing fundamentals to practical design decisions.',
  accent: '#f59e0b',
  topics: [
    {
      id: 'thermodynamics',
      title: 'Thermodynamics and energy systems',
      summary: 'Apply energy balances, the second law, and cycle efficiency to real machines rather than memorized formulas.',
      estimatedMinutes: 40,
      notes: [
        'The first law is an energy balance: energy entering a system minus energy leaving equals the change in stored energy. Define the system boundary and sign convention first, because most errors come from mixing work and heat directions.',
        'The second law limits how much work can be extracted from heat. A reversible Carnot engine operating between hot reservoir T_H and cold reservoir T_C has efficiency 1 - T_C/T_H, with temperatures in kelvin. No real cycle between the same reservoirs can exceed that value.',
        'Entropy is a measure of irreversibility. Friction, unrestrained expansion, mixing, and finite-temperature heat transfer generate entropy and reduce useful work. Real engines have lower efficiency because of these losses and because components are not reversible.',
        'A heat pump or refrigerator uses work to move heat from a cold region to a hot one. Its coefficient of performance can be greater than one because it is not creating energy; it is moving existing heat.',
      ],
      example: {
        title: 'Carnot efficiency',
        body: 'A heat engine operates between 500 K and 300 K. Its maximum possible efficiency is 1 - 300/500 = 0.40, or 40%. A real engine between those reservoirs will be lower because of friction, heat-transfer irreversibility, and other losses. A calculated efficiency above 40% for that temperature pair signals an error in the analysis.',
      },
      practice: [
        {
          id: 'heat-pump-cop',
          prompt: 'Why can a heat pump have a coefficient of performance greater than one without violating the first law?',
          difficulty: 'Easy',
          answer: 'COP compares delivered heat to work input; the heat is moved from a cold source, not created from the work alone.',
          explanation: 'The first law is still satisfied because the work plus the heat absorbed from the cold reservoir equals the heat delivered to the hot reservoir.',
        },
        {
          id: 'real-vs-carnot',
          prompt: 'Give two reasons a real power cycle is less efficient than the Carnot cycle between the same reservoirs.',
          difficulty: 'Medium',
          answer: 'Friction and other irreversibilities generate entropy, and heat transfer across a finite temperature difference is also irreversible. Real components also have pressure drops and incomplete combustion or heat recovery.',
          explanation: 'The Carnot cycle is an upper bound built from fully reversible processes. Practical cycles cannot eliminate losses, so the second-law efficiency is always below 100%.',
        },
      ],
    },
    {
      id: 'fluid-mechanics',
      title: 'Fluid mechanics and piping',
      summary: 'Use continuity, energy, and loss relationships to estimate flow behavior and pump requirements.',
      estimatedMinutes: 40,
      notes: [
        'For steady, incompressible flow, continuity requires A1V1 = A2V2. A smaller area therefore produces a higher velocity. Mass flow rate is density times area times velocity and is conserved when there is no leakage or accumulation.',
        'Bernoulli equations along a streamline trade pressure, velocity, and elevation head. They apply to steady, incompressible, inviscid flow with no work or heat transfer. In real piping, friction and fittings add losses that must be included in the energy balance.',
        'Reynolds number Re = rho V D / mu indicates whether flow is laminar or turbulent. Lower Reynolds numbers favor laminar flow; higher values indicate turbulence and stronger mixing. Pipe roughness and flow regime determine the friction factor.',
        'A pump adds head to overcome elevation, pressure, and losses. The operating point is where the pump curve meets the system curve. Operating far from the design point can cause cavitation, low efficiency, or motor overload.',
      ],
      example: {
        title: 'Diameter change and velocity',
        body: 'If a pipe diameter doubles while flow rate stays constant, the cross-sectional area becomes four times larger because area scales with diameter squared. Continuity then makes the average velocity one quarter of its original value. Pressure and loss calculations must use the new velocity.',
      },
      practice: [
        {
          id: 'continuity-diameter',
          prompt: 'Water flows at 2 m/s through a pipe. If the diameter is halved and flow rate is unchanged, what happens to the average velocity?',
          difficulty: 'Easy',
          answer: 'It becomes four times larger, or 8 m/s.',
          explanation: 'Area is proportional to diameter squared. Halving the diameter reduces area by a factor of four, so continuity requires velocity to increase by four.',
        },
        {
          id: 'bernoulli-assumptions',
          prompt: 'State two conditions under which the simple Bernoulli equation should not be applied without correction.',
          difficulty: 'Medium',
          answer: 'When viscous losses are significant, or when the flow is compressible or unsteady. It also assumes no shaft work or heat transfer along the streamline.',
          explanation: 'The simple equation is an ideal energy balance. Real piping needs loss terms, and compressible flow needs a different treatment because density changes.',
        },
      ],
    },
    {
      id: 'machine-design',
      title: 'Machine design and fatigue',
      summary: 'Size components for combined loading, account for stress concentrations, and design against fatigue rather than only yield.',
      estimatedMinutes: 45,
      notes: [
        'Normal stress is force divided by area; shear stress from torsion in a solid circular shaft is tau = 16T/(pi d^3). Bending stress depends on the moment and section modulus. Combined loading requires resolving stresses at a critical point, often with a failure theory such as von Mises or Tresca.',
        'Fatigue failure can occur below the yield strength after many repeated cycles. An S-N curve relates stress amplitude to cycles to failure. Mean stress, surface finish, size, temperature, and stress concentration all reduce fatigue life.',
        'Stress concentrations at holes, fillets, keyways, and threads amplify local stress. Use a stress-concentration factor and design smooth transitions where possible. A safety factor is not a substitute for understanding the failure mode.',
        'Bearings, shafts, keys, and bolted joints each have their own design checks. Bolted joints rely on preload to keep clamped members together; losing preload under vibration or creep can cause fatigue and loosening.',
      ],
      example: {
        title: 'Torsion in a solid shaft',
        body: 'A solid shaft with diameter 40 mm carries 500 N·m of torque. The shear stress is tau = 16T/(pi d^3) = 16(500)/(pi(0.040)^3) = 39.8 MPa. Compare that with the allowable shear stress after applying the appropriate safety factor, then check fatigue and stress concentrations separately.',
      },
      practice: [
        {
          id: 'fatigue-below-yield',
          prompt: 'Why can a component fail in fatigue even when the repeated stress is below the yield strength?',
          difficulty: 'Medium',
          answer: 'Repeated loading can initiate and grow cracks at stress concentrations even when the bulk stress is elastic. Fatigue is driven by cyclic stress amplitude and damage accumulation, not only by a single yield check.',
          explanation: 'A static yield check answers whether the part deforms permanently under one load. Fatigue requires cycle count, stress amplitude, surface condition, and notch effects.',
        },
        {
          id: 'safety-factor-purpose',
          prompt: 'What does a safety factor protect against, and what does it not replace?',
          difficulty: 'Easy',
          answer: 'It provides margin for uncertainty in loads, material properties, and analysis. It does not replace correct failure-mode identification, fatigue analysis, or testing.',
          explanation: 'A large factor can hide a wrong model while adding mass and cost. The design still needs the right load cases, boundary conditions, and material behavior.',
        },
      ],
    },
    {
      id: 'manufacturing-and-materials',
      title: 'Manufacturing processes and material selection',
      summary: 'Choose processes and materials from function, volume, tolerance, and failure requirements rather than habit.',
      estimatedMinutes: 40,
      notes: [
        'Casting creates complex shapes by solidifying liquid metal; forging shapes metal in the solid state and generally improves grain flow and toughness. Machining removes material for precision and flexibility. Welding joins components and introduces a heat-affected zone. Additive manufacturing builds parts layer by layer and is strong for low-volume complexity.',
        'Tolerances and surface finish drive cost. A looser tolerance that still meets function is usually cheaper. Design for manufacturing means minimizing setups, avoiding unnecessary features, and choosing processes that can hold the required geometry repeatably.',
        'Material selection compares mechanical properties, density, corrosion resistance, thermal behavior, manufacturability, availability, and cost. Ashby-style charts help screen candidates, but the final choice must include environment and joining requirements.',
        'Common failure modes include yielding, fatigue, brittle fracture, creep, wear, and corrosion. The operating environment can dominate the decision: a strong material that corrodes in service is not a good choice.',
      ],
      example: {
        title: 'Choosing a process for a low-volume bracket',
        body: 'A complex bracket with low annual volume and tight dimensional requirements is often a good fit for CNC machining or additive manufacturing because tooling cost is low and design changes are easy. High-volume production may justify casting or forging after the design stabilizes. The decision should compare total cost, lead time, material properties, and tolerance capability, not just unit price.',
      },
      practice: [
        {
          id: 'forging-grain-flow',
          prompt: 'Why can forging produce better toughness than casting for a highly loaded part?',
          difficulty: 'Medium',
          answer: 'Forging deforms the metal and aligns its grain flow with the part shape, reducing porosity and improving toughness in the direction of loading.',
          explanation: 'Casting can leave shrinkage porosity and a coarser as-cast structure. Forging closes internal defects and creates a more favorable microstructure, though it needs more tooling and processing.',
        },
        {
          id: 'tolerance-cost',
          prompt: 'Why does tightening a tolerance usually increase manufacturing cost?',
          difficulty: 'Easy',
          answer: 'It requires more precise machines, more setups, slower processing, better inspection, and higher scrap or rework rates.',
          explanation: 'Cost rises nonlinearly as tolerances approach the capability limit of a process. The design should specify only the tolerance the function actually needs.',
        },
      ],
    },
  ],
}
