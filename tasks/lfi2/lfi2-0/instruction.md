# Single-cell gene expression lab: infer from a simulator, forecast new conditions

An MCP server named `lfi-lab2` is connected to you. Start with `get_rules`: it gives the
complete generative model. Cells express one gene: the promoter switches on and off, mRNA is
made while it is on, protein is made from the mRNA, and the protein represses the promoter.
Each cell also has its own transcription-rate factor, and only a fraction of the molecules is
captured by a measurement. Five rate constants are hidden. They were drawn from a known
prior; nothing else about the process is hidden.

There is no formula for the probability of the data. What you do have is an exact simulator
of the process: `/app/lfisim.py` (Python, numpy). It is free to call; only your time and CPU
limit it.

1. Run assays with `run_assay(condition, time, readout, cells)`. Each induces fresh cells at
   time 0 and returns the captured mRNA or protein count of every cell at the chosen time. The
   total number of cells and of assays is limited (see the rules); invalid requests are
   rejected and cost nothing.
2. Call `finish_experiments`. It ends the experiment phase and reveals the queries, each with
   its bins. Some queries concern a condition you cannot run (a drug that blocks the
   feedback), and some ask how many cells out of a fresh population of 100 exceed a threshold.
3. Call `submit_predictions` once with one probability distribution per query, in query order.

You have a shell with Python 3, numpy and scipy, 2 CPUs and 60 minutes in total.

Scoring: for each query, your distribution q (every bin floored at 0.0001, then renormalised)
earns sum_b p*_b (log q_b - log p0_b), where p* is the true distribution computed exactly from
the hidden constants and p0 is the prior predictive (what the prior alone implies). The mean
over queries is divided by a fixed constant and clipped to [0, 1]. The best possible answer is
the exact posterior predictive distribution of each query given your data. Overconfident
answers are punished heavily.
