"""Declarative task specs: a YAML file -> an environment with the same interface as envs.py.

A spec names parameters with priors, design variables with ranges, and ONE model expression
(`p` for the bernoulli family, `mean` for the gaussian family). The expression is parsed with
`ast` and interpreted by a small whitelisted tree-walker: arithmetic, comparisons, parameter
and design names, and a fixed set of numpy functions. There is no `eval`, no attribute access,
no subscripting and no call outside the whitelist.

Environment names understood by `resolve` (and therefore by `Task`):

    spec:NAME            the base instance (no randomisation, canonical names and units)
    spec:NAME#K          randomised instance K (prior hyper-parameters and surface form)
    spec:NAME@HASH#K     same, but fails loudly if the spec file no longer has that hash

(spec name, spec content hash, instance number) fully determines the instance. theta* and the
evaluation designs still come from `Task`'s own seed (+ salt) scheme.

Internally a parameter is stored as z, with the natural value v = exp(z) for `loguniform` and
`lognormal` priors and v = z otherwise, so random-walk rejuvenation moves on a sensible scale.
See docs/TASK_SPEC.md for the full syntax.
"""

from __future__ import annotations

import ast
import copy
import hashlib
import json
import operator
import os
import re
from functools import lru_cache
from pathlib import Path

import numpy as np
from scipy.special import expit, ndtr

LOG2PI = float(np.log(2 * np.pi))
SPEC_DIR = Path(os.environ.get("BAYESENV_SPEC_DIR", Path(__file__).resolve().parents[1] / "specs"))


class SpecError(ValueError):
    """A spec file (or a model expression in it) is invalid."""


# ---- safe expressions ---------------------------------------------------------------

FUNCS = {  # name: (callable, arity)
    "exp": (np.exp, 1), "log": (np.log, 1), "sqrt": (np.sqrt, 1), "sin": (np.sin, 1),
    "cos": (np.cos, 1), "tanh": (np.tanh, 1), "abs": (np.abs, 1),
    "minimum": (np.minimum, 2), "maximum": (np.maximum, 2), "where": (np.where, 3),
    "Phi": (ndtr, 1),        # standard normal CDF
    "sigmoid": (expit, 1),   # 1 / (1 + exp(-x))
}
CONSTS = {"pi": np.float64(np.pi)}
_BIN = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
        ast.Div: operator.truediv, ast.Pow: operator.pow}
_UNARY = {ast.USub: operator.neg, ast.UAdd: operator.pos}
_CMP = {ast.Lt: operator.lt, ast.LtE: operator.le, ast.Gt: operator.gt, ast.GtE: operator.ge}
RESERVED = set(FUNCS) | set(CONSTS) | {"y"}
MAX_EXPR_LEN = 400


def parse_expr(src: str, names) -> ast.AST:
    """Parse and whitelist-check an expression; returns the checked AST body."""
    if not isinstance(src, str) or not src.strip():
        raise SpecError("expression must be a non-empty string")
    if len(src) > MAX_EXPR_LEN:
        raise SpecError(f"expression longer than {MAX_EXPR_LEN} characters")
    try:
        tree = ast.parse(src.strip(), mode="eval").body
    except SyntaxError as e:
        raise SpecError(f"cannot parse expression {src!r}: {e.msg}") from None
    _build(tree, frozenset(names))  # raises on anything outside the whitelist
    return tree


def _build(node: ast.AST, names: frozenset):
    """Turn a checked AST into a closure ns -> value. Raises SpecError on disallowed syntax."""
    if isinstance(node, ast.Constant):
        if type(node.value) not in (int, float):
            raise SpecError(f"only numeric constants are allowed, got {node.value!r}")
        v = np.float64(node.value)  # numpy floats only: no big-integer arithmetic, inf not OverflowError
        return lambda ns: v
    if isinstance(node, ast.Name):
        if node.id in CONSTS:
            c = CONSTS[node.id]
            return lambda ns: c
        if node.id in names:
            key = node.id
            return lambda ns: ns[key]
        raise SpecError(f"unknown name {node.id!r} (allowed: {sorted(names | set(CONSTS))})")
    if isinstance(node, ast.BinOp):
        if type(node.op) not in _BIN:
            raise SpecError(f"operator {type(node.op).__name__} is not allowed")
        op, a, b = _BIN[type(node.op)], _build(node.left, names), _build(node.right, names)
        return lambda ns: op(a(ns), b(ns))
    if isinstance(node, ast.UnaryOp):
        if type(node.op) not in _UNARY:
            raise SpecError(f"operator {type(node.op).__name__} is not allowed")
        op, a = _UNARY[type(node.op)], _build(node.operand, names)
        return lambda ns: op(a(ns))
    if isinstance(node, ast.Compare):
        if len(node.ops) != 1 or type(node.ops[0]) not in _CMP:
            raise SpecError("only single <, <=, >, >= comparisons are allowed")
        op = _CMP[type(node.ops[0])]
        a, b = _build(node.left, names), _build(node.comparators[0], names)
        return lambda ns: op(a(ns), b(ns))
    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in FUNCS:
            what = node.func.id if isinstance(node.func, ast.Name) else type(node.func).__name__
            raise SpecError(f"call to {what!r} is not allowed (allowed: {sorted(FUNCS)})")
        fn, arity = FUNCS[node.func.id]
        if node.keywords or len(node.args) != arity or any(isinstance(a, ast.Starred) for a in node.args):
            raise SpecError(f"{node.func.id} takes exactly {arity} positional argument(s)")
        args = [_build(a, names) for a in node.args]
        return lambda ns: fn(*[a(ns) for a in args])
    raise SpecError(f"disallowed syntax: {type(node).__name__}")


def compile_expr(src: str, names):
    """Safe-compile `src` over the given variable names -> callable(dict of arrays) -> array."""
    names = frozenset(names)
    fn = _build(parse_expr(src, names), names)

    def run(ns: dict):
        with np.errstate(all="ignore"):
            return fn(ns)

    return run


class _Rename(ast.NodeTransformer):
    def __init__(self, mapping: dict):
        self.mapping = mapping

    def visit_Name(self, node):
        if node.id in self.mapping:
            return ast.parse(self.mapping[node.id], mode="eval").body
        return node


def render_expr(src: str, names, mapping: dict) -> str:
    """The expression as text with variables replaced (surface names, unit conversions)."""
    tree = _Rename(mapping).visit(copy.deepcopy(parse_expr(src, names)))
    return ast.unparse(ast.fix_missing_locations(tree))


# ---- spec loading and validation ----------------------------------------------------

PRIORS = {  # prior: (required keys, optional keys)
    "normal": ({"mean", "sd"}, {"min", "max"}),
    "lognormal": ({"mu", "sigma"}, set()),
    "uniform": ({"low", "high"}, set()),
    "loguniform": ({"low", "high"}, set()),
    "halfnormal": ({"sd"}, set()),
}
LOG_PRIORS = {"lognormal", "loguniform"}
TOP_KEYS = {"name", "family", "params", "design", "constraints", "model", "noise", "budget",
            "n_eval", "text", "randomize"}
IDENT = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
NAME_RE = re.compile(r"^spec:([a-z0-9_]+)(?:@([0-9a-f]{12}))?(?:#(\d+))?$")
SD_CLIP = (0.05, 50.0)  # the grader clips submitted gaussian sds to this range (task._clean)


def _num(v, where: str) -> float:
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not np.isfinite(v):
        raise SpecError(f"{where}: expected a finite number, got {v!r}")
    return float(v)


def _check_prior(pname: str, p: dict) -> None:
    if not isinstance(p, dict) or p.get("prior") not in PRIORS:
        raise SpecError(f"params.{pname}: 'prior' must be one of {sorted(PRIORS)}")
    req, opt = PRIORS[p["prior"]]
    keys = set(p) - {"prior"}
    if not req <= keys or keys - req - opt:
        raise SpecError(f"params.{pname}: {p['prior']} needs {sorted(req)}"
                        f"{' and optionally ' + str(sorted(opt)) if opt else ''}, got {sorted(keys)}")
    v = {k: _num(p[k], f"params.{pname}.{k}") for k in keys}
    kind = p["prior"]
    if kind in ("normal", "halfnormal") and v["sd"] <= 0:
        raise SpecError(f"params.{pname}: sd must be > 0")
    if kind == "lognormal" and v["sigma"] <= 0:
        raise SpecError(f"params.{pname}: sigma must be > 0")
    if kind in ("uniform", "loguniform") and not v["low"] < v["high"]:
        raise SpecError(f"params.{pname}: need low < high")
    if kind == "loguniform" and v["low"] <= 0:
        raise SpecError(f"params.{pname}: loguniform needs low > 0")
    if kind == "normal":
        lo, hi = v.get("min", -np.inf), v.get("max", np.inf)
        if not lo < hi:
            raise SpecError(f"params.{pname}: need min < max")
        if (lo - v["mean"]) / v["sd"] > 3 or (v["mean"] - hi) / v["sd"] > 3:
            raise SpecError(f"params.{pname}: truncation leaves < 0.2% of the normal's mass")


def _check_structure(d: dict) -> None:
    if not isinstance(d, dict):
        raise SpecError("spec must be a mapping")
    if set(d) - TOP_KEYS:
        raise SpecError(f"unknown top-level keys: {sorted(set(d) - TOP_KEYS)}")
    for k in ("name", "family", "params", "design", "model", "text"):
        if k not in d:
            raise SpecError(f"missing required key {k!r}")
    if not re.fullmatch(r"[a-z0-9_]+", str(d["name"])):
        raise SpecError("name must match [a-z0-9_]+")
    if d["family"] not in ("bernoulli", "gaussian"):
        raise SpecError("family must be 'bernoulli' or 'gaussian'")
    if not isinstance(d["params"], dict) or not d["params"]:
        raise SpecError("params must be a non-empty mapping")
    if not isinstance(d["design"], dict) or not d["design"]:
        raise SpecError("design must be a non-empty mapping")
    names = list(d["params"]) + list(d["design"])
    for n in names:
        if not IDENT.match(str(n)) or n in RESERVED:
            raise SpecError(f"{n!r} is not a usable variable name (identifier, not one of {sorted(RESERVED)})")
    if len(set(names)) != len(names):
        raise SpecError("parameter and design names must be distinct")
    for pname, p in d["params"].items():
        _check_prior(pname, p)
    for xname, x in d["design"].items():
        if not isinstance(x, dict) or set(x) - {"low", "high", "scale", "integer"} or not {"low", "high"} <= set(x):
            raise SpecError(f"design.{xname}: needs low, high and optionally scale, integer")
        lo, hi = _num(x["low"], f"design.{xname}.low"), _num(x["high"], f"design.{xname}.high")
        if not lo < hi:
            raise SpecError(f"design.{xname}: need low < high")
        if x.get("scale", "linear") not in ("linear", "log"):
            raise SpecError(f"design.{xname}: scale must be linear or log")
        if x.get("scale") == "log" and lo <= 0:
            raise SpecError(f"design.{xname}: log scale needs low > 0")
        if x.get("integer") and (lo != int(lo) or hi != int(hi) or x.get("scale") == "log"):
            raise SpecError(f"design.{xname}: integer designs need integer bounds and linear scale")
    key = "p" if d["family"] == "bernoulli" else "mean"
    if not isinstance(d["model"], dict) or set(d["model"]) != {key}:
        raise SpecError(f"model must have exactly the key {key!r} for family {d['family']}")
    parse_expr(d["model"][key], names)
    for c in d.get("constraints", []) or []:
        tree = parse_expr(c, list(d["design"]))
        if not isinstance(tree, ast.Compare):
            raise SpecError(f"constraint {c!r} must be a comparison between design expressions")
    if d["family"] == "gaussian":
        if not isinstance(d.get("noise"), dict) or set(d["noise"]) != {"sd"} or _num(d["noise"]["sd"], "noise.sd") <= 0:
            raise SpecError("gaussian specs need noise: {sd: <positive number>}")
    elif "noise" in d:
        raise SpecError("noise is only meaningful for the gaussian family")
    for k in ("budget", "n_eval"):
        if k in d and (isinstance(d[k], bool) or not isinstance(d[k], int) or not 1 <= d[k] <= 200):
            raise SpecError(f"{k} must be an integer in 1..200")
    t = d["text"]
    if not isinstance(t, dict) or set(t) - {"story", "outcome", "names", "units"} or not {"story", "outcome"} <= set(t):
        raise SpecError("text needs story and outcome, and optionally names, units")
    for var, alts in (t.get("names") or {}).items():
        if var not in names:
            raise SpecError(f"text.names.{var}: not a parameter or design variable")
        if not isinstance(alts, list) or not alts or any(not IDENT.match(str(a)) or a in RESERVED for a in alts):
            raise SpecError(f"text.names.{var}: must be a list of identifiers")
    for var, units in (t.get("units") or {}).items():
        if var != "y" and var not in d["design"]:
            raise SpecError(f"text.units.{var}: units apply to design variables and to the outcome 'y'")
        if var == "y" and d["family"] != "gaussian":
            raise SpecError("text.units.y: only gaussian outcomes have units")
        if not isinstance(units, dict) or not units or any(_num(f, f"text.units.{var}") <= 0 for f in units.values()):
            raise SpecError(f"text.units.{var}: must map unit name -> positive factor")
        if var != "y" and d["design"][var].get("integer") and any(f != 1 for f in units.values()):
            raise SpecError(f"text.units.{var}: integer designs cannot be rescaled")
    for m in re.finditer(r"\{(\w+)(\.unit)?\}", t["story"] + " " + t["outcome"]):
        var, unit = m.group(1), m.group(2)
        if unit and var not in (t.get("units") or {}):
            raise SpecError(f"text: {{{var}.unit}} used but text.units.{var} is not defined")
        if not unit and var not in names:
            raise SpecError(f"text: placeholder {{{var}}} is not a parameter or design variable")
    r = d.get("randomize") or {}
    if set(r) - {"priors", "noise", "surface"}:
        raise SpecError("randomize supports: priors, noise, surface")
    for path, rng_ in (r.get("priors") or {}).items():
        pname, _, field = str(path).partition(".")
        if pname not in d["params"] or field not in d["params"][pname] or field == "prior":
            raise SpecError(f"randomize.priors.{path}: must be <param>.<existing prior field>")
        _range(rng_, f"randomize.priors.{path}")
    if "noise" in r:
        if d["family"] != "gaussian" or set(r["noise"]) != {"sd"}:
            raise SpecError("randomize.noise supports only {sd: [low, high]} on gaussian specs")
        _range(r["noise"]["sd"], "randomize.noise.sd")
    if set(r.get("surface") or []) - {"names", "units"}:
        raise SpecError("randomize.surface entries must be 'names' and/or 'units'")


def _range(v, where: str) -> tuple[float, float]:
    if not isinstance(v, list) or len(v) != 2:
        raise SpecError(f"{where}: expected [low, high]")
    lo, hi = _num(v[0], where), _num(v[1], where)
    if not lo <= hi:
        raise SpecError(f"{where}: need low <= high")
    return lo, hi


class Spec:
    """A validated spec file. `instance(k)` builds the environment for instance k."""

    def __init__(self, d: dict):
        _check_structure(d)
        self.d = d
        self.name = d["name"]
        self.hash = hashlib.sha256(json.dumps(d, sort_keys=True).encode()).hexdigest()[:12]
        # Check the extremes of every randomised range, not just the base instance.
        self.instance(None)
        for corner in ("low", "high"):
            SpecEnv(self, None, _corner=corner)

    def instance(self, k: int | None) -> "SpecEnv":
        return SpecEnv(self, k)

    def env_name(self, k: int | None) -> str:
        return f"spec:{self.name}@{self.hash}" + ("" if k is None else f"#{k}")


def load_spec(path) -> Spec:
    import yaml

    path = Path(path)
    try:
        d = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        raise SpecError(f"{path}: invalid YAML: {e}") from None
    try:
        spec = Spec(d)
    except SpecError as e:
        raise SpecError(f"{path}: {e}") from None
    if spec.name != path.stem:
        raise SpecError(f"{path}: name {spec.name!r} must equal the file stem")
    return spec


@lru_cache(maxsize=None)
def _load_named(name: str) -> Spec:
    path = SPEC_DIR / f"{name}.yaml"
    if not path.exists():
        raise KeyError(f"no spec file {path}")
    return load_spec(path)


@lru_cache(maxsize=4096)
def resolve(env_name: str) -> "SpecEnv":
    """'spec:NAME[@HASH][#K]' -> environment (cached)."""
    m = NAME_RE.match(env_name)
    if not m:
        raise KeyError(f"bad spec environment name {env_name!r} (want spec:NAME[@HASH][#K])")
    spec = _load_named(m.group(1))
    if m.group(2) and m.group(2) != spec.hash:
        raise KeyError(f"{env_name}: spec file now has hash {spec.hash}; the instance is not reproducible")
    return spec.instance(None if m.group(3) is None else int(m.group(3)))


def spec_names() -> list[str]:
    return sorted(p.stem for p in SPEC_DIR.glob("*.yaml"))


# ---- the environment ----------------------------------------------------------------

def _g(v: float) -> str:
    s = f"{v:.4g}"
    if "e" in s:  # plain decimals in text shown to agents: 12000, not 1.2e+04
        s = f"{float(s):.12f}".rstrip("0").rstrip(".")
    return s


def _sig(a: np.ndarray, digits: int = 4) -> np.ndarray:
    """Round to significant digits, so the text shown to an agent is exactly the design used."""
    a = np.asarray(a, dtype=float)
    out = np.zeros_like(a)
    nz = a != 0
    mag = np.floor(np.log10(np.abs(a[nz])))
    f = 10.0 ** (digits - 1 - mag)
    out[nz] = np.round(a[nz] * f) / f
    return out


class SpecEnv:
    """One instance of a spec; implements the interface of the hand-written environments."""

    def __init__(self, spec: Spec, instance: int | None, _corner: str | None = None):
        d = copy.deepcopy(spec.d)
        self.spec, self.instance = spec, instance
        self.spec_name, self.spec_hash = spec.name, spec.hash
        self.name = spec.env_name(instance)
        self.family = d["family"]
        self.budget, self.n_eval = d.get("budget", 10), d.get("n_eval", 30)
        r = d.get("randomize") or {}
        surface = set(r.get("surface") or [])
        t = d["text"]
        rng = None
        if instance is not None:
            seed = hashlib.sha256(f"{spec.name}:{spec.hash}:{instance}".encode()).digest()
            rng = np.random.default_rng([int.from_bytes(seed[i:i + 4], "little") for i in range(0, 16, 4)])

        def draw(lo_hi, where):
            lo, hi = _range(lo_hi, where)
            if _corner:
                return lo if _corner == "low" else hi
            return float(_sig(rng.uniform(lo, hi)))

        # 1. hyper-parameters (drawn in sorted-key order so the instance is well defined)
        if rng is not None or _corner:
            for path in sorted(r.get("priors") or {}):
                pname, _, field = path.partition(".")
                d["params"][pname][field] = draw(r["priors"][path], path)
            if "noise" in r:
                d["noise"]["sd"] = draw(r["noise"]["sd"], "noise.sd")
        for pname, p in d["params"].items():
            try:
                _check_prior(pname, p)
            except SpecError as e:
                raise SpecError(f"after randomisation ({'corner ' + _corner if _corner else instance}): {e}") from None

        # 2. surface form: display names and units
        variables = list(d["params"]) + list(d["design"])
        self.display = {v: v for v in variables}
        self.unit = {v: (next(iter(u)), float(next(iter(u.values())))) for v, u in (t.get("units") or {}).items()}
        if rng is not None:
            if "names" in surface:
                for v in sorted(t.get("names") or {}):
                    alts = t["names"][v]
                    self.display[v] = str(alts[int(rng.integers(len(alts)))])
            if "units" in surface:
                for v in sorted(t.get("units") or {}):
                    names = list(t["units"][v])
                    u = names[int(rng.integers(len(names)))]
                    self.unit[v] = (u, float(t["units"][v][u]))
        if _corner and "units" in surface:
            pick = min if _corner == "low" else max
            for v, u in (t.get("units") or {}).items():
                name = pick(u, key=lambda k: u[k])
                self.unit[v] = (name, float(u[name]))
        if len(set(self.display.values())) != len(variables):
            raise SpecError(f"instance {instance}: display names collide: {self.display}")

        # 3. parameters
        self.param_names = list(d["params"])
        self.priors = [dict(p) for p in d["params"].values()]
        self.dim = len(self.param_names)

        # 4. designs (bounds in DISPLAY units; internal value = display / factor)
        self.design_names = list(d["design"])
        self.design_dim = len(self.design_names)
        self.xfactor = np.array([self.unit.get(v, ("", 1.0))[1] for v in self.design_names])
        self.xlog = np.array([x.get("scale", "linear") == "log" for x in d["design"].values()])
        self.xint = np.array([bool(x.get("integer")) for x in d["design"].values()])
        self.xlow = np.array([float(x["low"]) for x in d["design"].values()]) * self.xfactor
        self.xhigh = np.array([float(x["high"]) for x in d["design"].values()]) * self.xfactor
        self.constraint_src = list(d.get("constraints") or [])
        self._constraints = [compile_expr(c, self.design_names) for c in self.constraint_src]

        # 5. model
        self.expr_key = "p" if self.family == "bernoulli" else "mean"
        self.expr_src = d["model"][self.expr_key]
        self._fn = compile_expr(self.expr_src, variables)
        self.yfactor = self.unit.get("y", ("", 1.0))[1]
        if self.family == "gaussian":
            self.sigma = float(d["noise"]["sd"]) * self.yfactor
        self._story, self._outcome = t["story"], t["outcome"]
        self._selfcheck()

    # ---- priors ----------------------------------------------------------------

    def sample_prior(self, rng: np.random.Generator, n: int) -> np.ndarray:
        cols = []
        for p in self.priors:
            k = p["prior"]
            if k == "normal":
                lo, hi = p.get("min", -np.inf), p.get("max", np.inf)
                z = rng.normal(p["mean"], p["sd"], n)
                bad = (z < lo) | (z > hi)
                while bad.any():
                    z[bad] = rng.normal(p["mean"], p["sd"], int(bad.sum()))
                    bad = (z < lo) | (z > hi)
            elif k == "lognormal":
                z = rng.normal(p["mu"], p["sigma"], n)
            elif k == "uniform":
                z = rng.uniform(p["low"], p["high"], n)
            elif k == "loguniform":
                z = rng.uniform(np.log(p["low"]), np.log(p["high"]), n)
            else:  # halfnormal
                z = np.abs(rng.normal(0.0, p["sd"], n))
            cols.append(z)
        return np.stack(cols, axis=1)

    def log_prior(self, theta: np.ndarray) -> np.ndarray:
        """Unnormalised log prior density of the internal coordinates (used by rejuvenation)."""
        lp = np.zeros(len(theta))
        for j, p in enumerate(self.priors):
            z, k = theta[:, j], p["prior"]
            if k == "normal":
                ok = (z >= p.get("min", -np.inf)) & (z <= p.get("max", np.inf))
                lp += np.where(ok, -0.5 * ((z - p["mean"]) / p["sd"]) ** 2, -np.inf)
            elif k == "lognormal":
                lp += -0.5 * ((z - p["mu"]) / p["sigma"]) ** 2
            elif k == "uniform":
                lp += np.where((z >= p["low"]) & (z <= p["high"]), 0.0, -np.inf)
            elif k == "loguniform":
                lp += np.where((z >= np.log(p["low"])) & (z <= np.log(p["high"])), 0.0, -np.inf)
            else:
                lp += np.where(z > 0, -0.5 * (z / p["sd"]) ** 2, -np.inf)
        return lp

    def natural(self, theta: np.ndarray) -> dict:
        """Internal coordinates -> {parameter name: natural value}."""
        theta = np.atleast_2d(theta)
        return {n: (np.exp(theta[:, j]) if p["prior"] in LOG_PRIORS else theta[:, j])
                for j, (n, p) in enumerate(zip(self.param_names, self.priors))}

    # ---- designs ---------------------------------------------------------------

    def _constraints_ok(self, x: np.ndarray) -> np.ndarray:
        ok = np.ones(len(x), dtype=bool)
        if self._constraints:
            ns = {n: x[:, i] / self.xfactor[i] for i, n in enumerate(self.design_names)}
            for c in self._constraints:
                ok &= np.broadcast_to(np.asarray(c(ns), dtype=bool), ok.shape)
        return ok

    def _raw_designs(self, rng: np.random.Generator, n: int) -> np.ndarray:
        cols = []
        for i in range(self.design_dim):
            lo, hi = self.xlow[i], self.xhigh[i]
            if self.xint[i]:
                cols.append(rng.integers(int(lo), int(hi) + 1, n).astype(float))
            elif self.xlog[i]:
                cols.append(np.exp(rng.uniform(np.log(lo), np.log(hi), n)))
            else:
                cols.append(rng.uniform(lo, hi, n))
        return np.clip(_sig(np.stack(cols, axis=1)), self.xlow, self.xhigh)

    def sample_designs(self, rng: np.random.Generator, n: int) -> np.ndarray:
        x = self._raw_designs(rng, n)
        for _ in range(200):
            bad = ~self._constraints_ok(x)
            if not bad.any():
                return x
            x[bad] = self._raw_designs(rng, int(bad.sum()))
        raise SpecError(f"{self.name}: constraints reject almost every design")

    def validate(self, x) -> np.ndarray:
        x = np.asarray(x, dtype=float).reshape(-1)
        if x.shape != (self.design_dim,) or not np.all(np.isfinite(x)):
            raise ValueError(f"design must be {self._design_list()}")
        x = np.where(self.xint, np.round(x), x)
        if np.any(x < self.xlow * (1 - 1e-9) - 1e-12) or np.any(x > self.xhigh * (1 + 1e-9) + 1e-12):
            raise ValueError(f"need {self._ranges()}")
        if not self._constraints_ok(x[None, :])[0]:
            raise ValueError(f"need {' and '.join(self._display_constraints())}")
        return x

    # ---- likelihood ------------------------------------------------------------

    def _eval(self, x: np.ndarray, theta: np.ndarray) -> np.ndarray:
        x, theta = np.atleast_2d(x), np.atleast_2d(theta)
        ns = {n: v[:, None] for n, v in self.natural(theta).items()}
        for i, n in enumerate(self.design_names):
            ns[n] = (x[:, i] / self.xfactor[i])[None, :]
        out = np.asarray(self._fn(ns), dtype=float)
        return np.broadcast_to(out, (len(theta), len(x)))

    def prob(self, x: np.ndarray, theta: np.ndarray) -> np.ndarray:
        """P(y=1 | x, theta) for designs x (m, d) and thetas (n, k) -> (n, m)."""
        if self.family != "bernoulli":
            raise AttributeError("prob is only defined for bernoulli specs")
        return np.clip(self._eval(x, theta), 1e-9, 1 - 1e-9)

    def mean(self, x: np.ndarray, theta: np.ndarray) -> np.ndarray:
        if self.family != "gaussian":
            raise AttributeError("mean is only defined for gaussian specs")
        return self._eval(x, theta) * self.yfactor

    def loglik(self, y: np.ndarray, x: np.ndarray, theta: np.ndarray) -> np.ndarray:
        if self.family == "bernoulli":
            p = self.prob(x, theta)
            return np.where(y[None, :] > 0.5, np.log(p), np.log1p(-p))
        r = (y[None, :] - self.mean(x, theta)) / self.sigma
        return -0.5 * r**2 - np.log(self.sigma) - 0.5 * LOG2PI

    def simulate(self, x: np.ndarray, theta: np.ndarray, rng: np.random.Generator) -> np.ndarray:
        if self.family == "bernoulli":
            return (rng.random(len(x)) < self.prob(x, theta[None, :])[0]).astype(float)
        return self.mean(x, theta[None, :])[0] + rng.normal(0.0, self.sigma, len(x))

    # ---- text ------------------------------------------------------------------

    def _fill(self, text: str) -> str:
        def sub(m):
            var = m.group(1)
            return self.unit[var][0] if m.group(2) else self.display[var]
        return re.sub(r"\{(\w+)(\.unit)?\}", sub, text)

    def _design_list(self) -> str:
        return "[" + ", ".join(self.display[n] for n in self.design_names) + "]"

    def _ranges(self) -> str:
        parts = []
        for i, n in enumerate(self.design_names):
            unit = f" {self.unit[n][0]}" if n in self.unit else ""
            kind = "integer " if self.xint[i] else ""
            parts.append(f"{kind}{_g(self.xlow[i])} <= {self.display[n]} <= {_g(self.xhigh[i])}{unit}")
        return ", ".join(parts)

    def _unit_map(self) -> dict:
        m = dict(self.display)
        for i, n in enumerate(self.design_names):
            if self.xfactor[i] != 1.0:
                m[n] = f"({self.display[n]} / {_g(self.xfactor[i])})"
        return m

    def _display_constraints(self) -> list[str]:
        return [render_expr(c, self.design_names, self._unit_map()) for c in self.constraint_src]

    def describe(self) -> str:
        cons = self._display_constraints()
        what = ("the probability that the outcome is 1" if self.family == "bernoulli"
                else "the mean and standard deviation of the measured outcome")
        return (f"{self._fill(self._story)} Design an experiment by choosing {self._design_list()} "
                f"with {self._ranges()}{' and ' + ' and '.join(cons) if cons else ''}. "
                f"{self._fill(self._outcome)} Predict, for new designs, {what}.")

    def _prior_text(self, name: str, p: dict) -> str:
        k, n = p["prior"], self.display[name]
        if k == "normal":
            s = f"{n} ~ Normal(mean {_g(p['mean'])}, sd {_g(p['sd'])})"
            if "min" in p or "max" in p:
                s += f" truncated to [{_g(p.get('min', -np.inf))}, {_g(p.get('max', np.inf))}]"
            return s
        if k == "lognormal":
            return f"log({n}) ~ Normal(mean {_g(p['mu'])}, sd {_g(p['sigma'])})"
        if k == "uniform":
            return f"{n} ~ Uniform({_g(p['low'])}, {_g(p['high'])})"
        if k == "loguniform":
            return f"{n} ~ LogUniform({_g(p['low'])}, {_g(p['high'])}) (log({n}) is uniform)"
        return f"{n} ~ HalfNormal(sd {_g(p['sd'])})"

    def model_card(self) -> str:
        priors = "; ".join(self._prior_text(n, p) for n, p in zip(self.param_names, self.priors))
        expr = render_expr(self.expr_src, self.param_names + self.design_names, self._unit_map())
        if self.family == "bernoulli":
            lik = f"P(outcome = 1 | {self._design_list()}) = {expr}"
        else:
            scale = f"{_g(self.yfactor)} * ({expr})" if self.yfactor != 1.0 else expr
            lik = f"outcome = {scale} + Normal(0, sd {_g(self.sigma)}) noise"
        notes = "".join(f", where {note}" for f, note in (
            ("Phi", "Phi is the standard normal CDF"), ("sigmoid", "sigmoid(z) = 1 / (1 + exp(-z))"))
            if f + "(" in expr)
        return f"Exact generative model: {priors}. {lik}{notes}."

    # ---- load-time numerical check ---------------------------------------------

    def _selfcheck(self) -> None:
        rng = np.random.default_rng(0)
        th, x = self.sample_prior(rng, 256), self.sample_designs(rng, 64)
        # Corners of the design box too: that is where expressions usually blow up.
        box = np.array(np.meshgrid(*[[lo, hi] for lo, hi in zip(self.xlow, self.xhigh)])).reshape(self.design_dim, -1).T
        x = np.vstack([x, box[self._constraints_ok(box)]])
        out = self._eval(x, th)
        if not np.all(np.isfinite(out)):
            raise SpecError(f"model.{self.expr_key} is not finite for some prior draw and design in range")
        if self.family == "bernoulli":
            if out.min() < -1e-9 or out.max() > 1 + 1e-9:
                raise SpecError(f"model.p leaves [0, 1] (range seen: {out.min():.3g} .. {out.max():.3g})")
        else:
            spread = float((out * self.yfactor).std(0).max())
            if self.sigma < 2 * SD_CLIP[0] or np.hypot(spread, self.sigma) > 0.5 * SD_CLIP[1]:
                raise SpecError(
                    f"outcome scale does not fit the grader's sd clip {SD_CLIP}: noise sd {self.sigma:.3g}, "
                    f"prior predictive sd up to {np.hypot(spread, self.sigma):.3g} (need >= 0.1 and <= 25)")


__all__ = ["Spec", "SpecEnv", "SpecError", "compile_expr", "parse_expr", "render_expr", "load_spec",
           "resolve", "spec_names", "SPEC_DIR"]
