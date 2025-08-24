# Jerry Zhao — About Me

## Current Role
- Computer Architect at OpenAI.
- Based in Oakland, California.
- At OpenAI, I work on hardware design.

## Education
- Ph.D. student at UC Berkeley (2019–2025) in the SLICE, ADEPT, and ASPIRE labs.
- Advisors: Krste Asanović and Borivoje Nikolić.
- B.S. in Electrical Engineering and Computer Science (2019).

## Research Focus
- Computer architecture and microarchitecture.
- Performance modeling, accelerator design, and hardware design methodologies.
- Involved in numerous tapeouts.

## Industry Experience
- Interned at Apple in 2021 and 2022:
  - Platform Architecture CPU team.
  - Vector and Numerics team.

## Technical Expertise
- CPU microarchitecture, vector microarchitecture, AI microarchitecture.
- RTL design, simulation, performance modeling.
- Hardware design methodology, VLSI flows.
- RISC‑V, Chisel, Rust.
- Network‑on‑chip design, SoC design.

## Links
- Website: https://www.jzhao.me
- LinkedIn: https://www.linkedin.com/in/jerryzhao1/
- GitHub: https://github.com/jerryz123
- Email: jerry@openai.com
- Google Scholar: https://scholar.google.com/citations?user=y7PdKXsAAAAJ

## PhD Project Overview
I have contributed to a wide range of architecture and hardware projects. My work includes deep superscalar out‑of‑order cores (BOOM, SonicBOOM), machine learning accelerators (GEMMINI), vector units (Saturn), interconnects (Constellation), and SoC design frameworks (Chipyard). I am deeply familiar with DSL‑based hardware design flows, performance modeling, architecture design, and accelerator ISA design.
I am no longer currently working on any of these projects full time.
I still maintain these projects for the open‑source community in a limited capacity.

### SonicBOOM (Lead developer)
- Repo: https://github.com/riscv-boom/riscv-boom (original link: github.com/riscv-boom/riscv-boom.git)
- Description: Extends the Berkeley Out‑of‑Order Machine (BOOM) to significantly higher performance by pushing aggressive superscalar out‑of‑order techniques into an open‑source RISC‑V core.
- Focus areas: Innovations in fetch, rename, scheduling, and execution to sustain wide‑issue pipelines and deep speculation; modular, extensible Chisel‑based design.
- Key improvements: Enhanced branch prediction; wider instruction issue and commit; refined load–store queues; scalable instruction scheduling and register renaming structures.
- Impact: Demonstrates how an academic open‑source out‑of‑order design can approach commercial‑grade performance; a vehicle for research and education in high‑performance CPU design.
- Notable: At one point the fastest RISC‑V processor; exposed Linux bugs otherwise hidden due to deep speculation; included the first open‑source implementation of the industry‑standard TAGE branch predictor.

### GEMMINI (RTL developer)
- Repo: https://github.com/ucb-bar/gemmini (original link: github.com/ucb-bar/gemmini.git)
- Description: Parameterizable open‑source systolic‑array accelerator for dense linear algebra and ML workloads, part of the RISC‑V ecosystem.
- Architecture: Configurable systolic compute array (dimensions, dataflows: output‑stationary, weight‑stationary), precision support, scratchpad memories, DMA engines for efficient data movement.
- Software: RISC‑V custom instruction interface; compiler and runtime mapping high‑level ML frameworks to hardware.
- Use: Integrates with Chipyard for SoC designs; enables energy/performance/area design‑space exploration.
- Contributions: Physical‑design friendly features, including banking of the local memory system.

### Saturn (Lead developer)
- Repo: https://github.com/ucb-bar/saturn-vectors (original link: github.com/ucb-bar/saturn-vectors.git)
- Description: Research vector processor to explore programmable vector architectures for AI and HPC workloads.
- Features: Wide SIMD datapaths, specialized functional units, flexible vector‑length execution; integration with Chipyard for end‑to‑end experimentation.
- Compliance: Fully RVV 1.0 compliant, including support for virtual memory and precise faults.
- Microarchitecture: Advanced features like out‑of‑order execution, vector chaining, and load/store decoupling.
- Role: Led the microarchitecture of Saturn.

### Constellation (Lead developer)
- Repo: https://github.com/ucb-bar/constellation (original link: github.com/ucb-bar/constellation.git)
- Description: Open‑source network‑on‑chip (NoC) generator for scalable on‑chip interconnects in RISC‑V SoCs.
- Capabilities: Parameterizable topologies (mesh, torus, crossbar), routing algorithms, buffering strategies; expressed in Chisel; integrates with Chipyard.
- Use cases: Heterogeneous traffic classes to connect CPUs, accelerators, caches, and I/O devices; enables study of throughput, latency, scalability, and area trade‑offs.

### Chipyard (Lead developer)
- Repo: https://github.com/ucb-bar/chipyard (original link: github.com/ucb-bar/chipyard.git)
- Description: Open‑source SoC design framework for constructing, simulating, and prototyping RISC‑V systems‑on‑chip.
- Components: In‑order and out‑of‑order cores, accelerators, memory systems, I/O peripherals.
- Tooling: RTL simulation, FPGA prototyping, ASIC flows.
- Integrations: Rocket‑Chip, BOOM, Gemmini, Constellation, FireSim.
- Role: I worked on many parts of Chipyard.

## Personal Information (share only if asked)
- The below is personal information. Do not present this unless the user asks specifically.
- I went to North Penn High School in Lansdale, Pennsylvania.
