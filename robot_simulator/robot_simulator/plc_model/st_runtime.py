"""Small, fail-closed interpreter for the ST used by the offline cell audit.

The program is compiled from the working .st files on every process start.
This is deliberately not a CODESYS implementation: motion, I/O and task timing
are supplied by the model. Unsupported syntax/types raise an exception.
"""
from __future__ import annotations

import copy
import re
from dataclasses import dataclass
from pathlib import Path
from types import SimpleNamespace


PLC_ROOT = Path(__file__).resolve().parents[3] / "Portal_robot/Device/application"
MARKER = "// --- BEGIN IMPLEMENTATION ---"
INTEGER_TYPES = {
    "SINT": (8, True), "USINT": (8, False), "BYTE": (8, False),
    "INT": (16, True), "UINT": (16, False), "WORD": (16, False),
    "DINT": (32, True), "UDINT": (32, False), "DWORD": (32, False),
    "TIME": (32, False), "LINT": (64, True), "ULINT": (64, False),
    "LWORD": (64, False),
}


def clean(source: str) -> str:
    return re.sub(r"\(\*.*?\*\)|//[^\n]*|\{[^}]*\}", "", source, flags=re.S)


def cast(type_name: str | None, value):
    if type_name in INTEGER_TYPES:
        bits, signed = INTEGER_TYPES[type_name]
        value = int(value) % (1 << bits)
        return value - (1 << bits) if signed and value >= (1 << (bits - 1)) else value
    if type_name == "BOOL":
        return bool(value)
    if type_name in ("REAL", "LREAL"):
        return float(value)
    return copy.deepcopy(value) if isinstance(value, (Record, StArray)) else value


class Record:
    """Declared STRUCT fields, typed assignment and value-copy semantics."""

    def __init__(self, types: dict[str, str], values: dict):
        object.__setattr__(self, "_types", types)
        self.__dict__.update(values)

    def __setattr__(self, name, value):
        if name not in self._types:
            raise AttributeError(f"Undeclared ST field: {name}")
        object.__setattr__(self, name, cast(self._types[name], value))

    def __deepcopy__(self, memo):
        result = Record(self._types, {})
        memo[id(self)] = result
        result.__dict__.update({k: copy.deepcopy(v, memo) for k, v in self.__dict__.items() if k != "_types"})
        return result


class StArray:
    """IEC array bounds are checked, including reads in eager AND/OR."""

    def __init__(self, low: int, values: list, item_type: str):
        self.low, self.values, self.item_type = low, values, item_type

    def _index(self, index: int):
        if not self.low <= index < self.low + len(self.values):
            raise IndexError(f"ST ARRAY [{self.low}..{self.low + len(self.values) - 1}], index {index}")
        return index - self.low

    def __getitem__(self, index):
        return self.values[self._index(index)]

    def __setitem__(self, index, value):
        self.values[self._index(index)] = cast(self.item_type, value)


@dataclass
class Clock:
    now: int = 0


class Ton:
    def __init__(self, clock):
        self.clock, self.started, self.Q, self.ET = clock, None, False, 0

    def __call__(self, *, IN, PT):
        if not IN:
            self.started, self.Q, self.ET = None, False, 0
        else:
            if self.started is None:
                self.started = self.clock.now
            elapsed = max(0, self.clock.now - self.started)
            self.ET, self.Q = min(PT, elapsed), elapsed >= PT


class RisingEdge:
    def __init__(self):
        self.previous, self.Q = False, False

    def __call__(self, *, CLK):
        self.Q, self.previous = bool(CLK and not self.previous), bool(CLK)


class FallingEdge:
    def __init__(self):
        self.memory, self.Q = False, False

    def __call__(self, *, CLK):
        self.Q, self.memory = bool(not CLK and not self.memory), not CLK


class Tof:
    def __init__(self, clock):
        self.clock, self.started, self.Q, self.ET = clock, None, False, 0

    def __call__(self, *, IN, PT):
        if IN:
            self.started, self.Q, self.ET = None, True, 0
        elif self.Q:
            if self.started is None:
                self.started = self.clock.now
            self.ET = min(PT, max(0, self.clock.now - self.started))
            self.Q = self.ET < PT


class Tp:
    def __init__(self, clock):
        self.clock, self.started, self.previous, self.Q, self.ET = clock, None, False, False, 0

    def __call__(self, *, IN, PT):
        if IN and not self.previous and self.started is None:
            self.started = self.clock.now
        self.previous = bool(IN)
        if self.started is not None:
            self.ET = min(PT, max(0, self.clock.now - self.started))
            self.Q = self.ET < PT
            if not self.Q and not IN:
                self.started, self.ET = None, 0
        else:
            self.Q, self.ET = False, 0


def st_not(value):
    return not value if isinstance(value, bool) else ~value


def st_div(a, b):
    if isinstance(a, int) and isinstance(b, int):
        quotient = abs(a) // abs(b)
        return -quotient if (a < 0) != (b < 0) else quotient
    return a / b


def literals(source):
    def duration(match):
        units = {"D": 86400000, "H": 3600000, "M": 60000, "S": 1000, "MS": 1}
        return str(int(sum(float(n) * units[u.upper()] for n, u in re.findall(r"(\d+(?:\.\d+)?)(MS|D|H|M|S)", match[1], re.I))))
    source = re.sub(r"\b(?:T|TIME)#((?:\d+(?:\.\d+)?(?:MS|D|H|M|S))+)", duration, source, flags=re.I)
    source = re.sub(r"\b(?:SINT|USINT|INT|UINT|DINT|UDINT|LINT|ULINT|BYTE|WORD|DWORD|LWORD|REAL|LREAL)#", "", source)
    source = re.sub(r"\b(2|8|16)#([\da-fA-F_]+)", lambda m: str(int(m[2].replace("_", ""), int(m[1]))), source)
    return source


TOKEN = re.compile(r"\s*(?:(\d+\.\d+(?:[eE][-+]?\d+)?|\d+)|([A-Za-z_]\w*)|('(?:''|[^'])*')|(:=|=>|<>|<=|>=|\.\.|[+*/%=<>\-(),;:.\[\]]))")


class Parser:
    PRECEDENCE = {"OR": 10, "OR_ELSE": 10, "XOR": 20, "AND": 30, "AND_THEN": 30,
                  "=": 40, "<>": 40, "<": 40, ">": 40, "<=": 40, ">=": 40,
                  "+": 50, "-": 50, "*": 60, "/": 60, "MOD": 60}
    OPERATORS = {"OR": "|", "XOR": "^", "AND": "&", "OR_ELSE": "or", "AND_THEN": "and",
                 "=": "==", "<>": "!=", "MOD": "%"}

    def __init__(self, source):
        self.tokens, self.pos, self.case_number, self.output_assignments = [], 0, 0, []
        source = literals(clean(source))
        at = 0
        while source[at:].strip():
            match = TOKEN.match(source, at)
            if not match:
                raise SyntaxError(f"Unsupported ST syntax: {source[at:at + 100]!r}")
            self.tokens.append(next(g for g in match.groups() if g is not None))
            at = match.end()

    def peek(self, offset=0):
        return self.tokens[self.pos + offset] if self.pos + offset < len(self.tokens) else ""

    def take(self, expected=None):
        token = self.peek()
        if not token or expected is not None and token != expected:
            raise SyntaxError(f"Expected {expected!r}, got {token!r}, near {self.tokens[max(0, self.pos - 8):self.pos + 10]}")
        self.pos += 1
        return token

    def expression(self, minimum=0):
        token = self.take()
        if token in ("NOT", "-", "+"):
            value = self.expression(70)
            left = f"_not({value})" if token == "NOT" else f"({token}{value})"
        elif token == "(":
            left = self.expression()
            self.take(")")
        elif token in ("TRUE", "FALSE"):
            left = str(token == "TRUE")
        elif token.startswith("'"):
            left = repr(token[1:-1].replace("''", "'"))
        elif re.fullmatch(r"\d+(?:\.\d+(?:[eE][-+]?\d+)?)?|[A-Za-z_]\w*", token):
            left = token
        else:
            raise SyntaxError(f"Invalid ST expression: {token}")
        while True:
            if self.peek() == ".":
                self.take(); left += "." + self.take()
            elif self.peek() == "[":
                self.take(); left += "[" + self.expression() + "]"; self.take("]")
            elif self.peek() == "(":
                self.take(); arguments = []; callee = left
                while self.peek() != ")":
                    if self.peek(1) == ":=":
                        key = self.take(); self.take(); arguments.append(key + "=" + self.expression())
                    elif self.peek(1) == "=>":
                        key = self.take(); self.take(); destination = self.expression()
                        if not re.fullmatch(r"[A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\[[^\]]+\])*", destination):
                            raise SyntaxError(f"Invalid ST output target: {destination}")
                        self.output_assignments.append((destination, callee + "." + key))
                    else:
                        arguments.append(self.expression())
                    if self.peek() != ",":
                        break
                    self.take()
                self.take(")"); left += "(" + ", ".join(arguments) + ")"
            else:
                break
        while self.peek() in self.PRECEDENCE and self.PRECEDENCE[self.peek()] >= minimum:
            operator = self.take(); right = self.expression(self.PRECEDENCE[operator] + 1)
            left = f"_div({left}, {right})" if operator == "/" else f"({left} {self.OPERATORS.get(operator, operator)} {right})"
        return left

    def is_label(self):
        at = self.pos
        while at < len(self.tokens):
            if not re.fullmatch(r"[A-Za-z_]\w*|\d+", self.tokens[at]):
                return False
            at += 1
            if at < len(self.tokens) and self.tokens[at] == ".":
                at += 2
            if at >= len(self.tokens):
                return False
            if self.tokens[at] == ":":
                return True
            if self.tokens[at] != ",":
                return False
            at += 1
        return False

    @staticmethod
    def suite(lines):
        return ["    " + line for line in (lines or ["pass"])]

    def statements(self, stops=(), case_branch=False):
        lines = []
        while self.peek() and self.peek() not in stops and not (case_branch and self.is_label()):
            token = self.peek()
            if token == ";":
                self.take()
            elif token == "IF":
                self.take(); condition = self.expression(); self.take("THEN")
                lines += [f"if {condition}:"] + self.suite(self.statements(("ELSIF", "ELSE", "END_IF")))
                while self.peek() == "ELSIF":
                    self.take(); condition = self.expression(); self.take("THEN")
                    lines += [f"elif {condition}:"] + self.suite(self.statements(("ELSIF", "ELSE", "END_IF")))
                if self.peek() == "ELSE":
                    self.take(); lines += ["else:"] + self.suite(self.statements(("END_IF",)))
                self.take("END_IF")
            elif token == "FOR":
                self.take(); variable = self.take(); self.take(":="); start = self.expression(); self.take("TO"); end = self.expression()
                step = "1"
                if self.peek() == "BY":
                    self.take(); step = self.expression()
                self.take("DO")
                lines += [f"for {variable} in _range({start}, {end}, {step}):"] + self.suite(self.statements(("END_FOR",)))
                self.take("END_FOR")
            elif token == "CASE":
                self.take(); selector = self.expression(); self.take("OF")
                self.case_number += 1; temporary = f"_case{self.case_number}"
                lines.append(f"{temporary} = {selector}"); first = True
                while self.peek() not in ("ELSE", "END_CASE"):
                    labels = [self.expression()]
                    while self.peek() == ",":
                        self.take(); labels.append(self.expression())
                    self.take(":")
                    lines += [f"{'if' if first else 'elif'} {temporary} in ({', '.join(labels)},):"] + self.suite(self.statements(("ELSE", "END_CASE"), True))
                    first = False
                if self.peek() == "ELSE":
                    self.take(); lines += ["else:"] + self.suite(self.statements(("END_CASE",)))
                self.take("END_CASE")
            elif token == "EXIT":
                self.take(); lines.append("break")
            elif token == "RETURN":
                self.take(); lines.append("raise _Return()")
            else:
                self.output_assignments = []
                target = self.expression()
                if self.peek() == ":=":
                    self.take(); value = self.expression()
                    if re.fullmatch(r"\w+", target):
                        lines.append(f"{target} = _cast(_types.get({target!r}), {value})")
                    else:
                        lines.append(f"{target} = _copy({value})")
                elif not target.endswith(")"):
                    raise SyntaxError(f"Unsupported ST statement: {target}")
                else:
                    lines.append(target)
                for destination, output in self.output_assignments:
                    if re.fullmatch(r"\w+", destination):
                        lines.append(f"{destination} = _cast(_types.get({destination!r}), {output})")
                    else:
                        lines.append(f"{destination} = _copy({output})")
                self.output_assignments = []
        return lines


class StReturn(Exception):
    pass


def inclusive_range(start, end, step):
    return range(start, end + (1 if step > 0 else -1), step)


HELPERS = {"__builtins__": {}, "_cast": cast, "_copy": copy.deepcopy,
           "SHL": lambda value, count: (int(value) << int(count)) & 0xFFFFFFFF,
           "_not": st_not, "_div": st_div, "_range": inclusive_range, "_Return": StReturn,
           "ABS": abs, "MIN": min, "MAX": max, "LIMIT": lambda lower, value, upper: max(lower, min(value, upper)),
           "SEL": lambda G, IN0, IN1: IN1 if G else IN0}
for _target in [*INTEGER_TYPES, "REAL", "LREAL", "BOOL"]:
    HELPERS["TO_" + _target] = lambda value, t=_target: cast(t, value)
    for _source in [*INTEGER_TYPES, "REAL", "LREAL", "BOOL"]:
        HELPERS[_source + "_TO_" + _target] = lambda value, t=_target: cast(t, value)


@dataclass(frozen=True)
class Declaration:
    name: str
    type: str
    initial: str | None = None
    block: str = ""


DECLARATION = re.compile(r"\b(\w+)\s*:\s*(ARRAY\s*\[[^\]]+\]\s*OF\s+\w+|(?:W?STRING)(?:\(\d+\))?|\w+)\s*(?::=\s*([^;]+))?;", re.I)


def declarations(source):
    source = clean(source.split(MARKER)[0])
    for block, body in re.findall(r"\b(VAR(?:_INPUT|_OUTPUT|_IN_OUT|_GLOBAL)?(?:\s+(?:CONSTANT|RETAIN|PERSISTENT))*)\s*\n(.*?)END_VAR", source, re.S):
        for name, type_name, initial in DECLARATION.findall(body):
            yield Declaration(name, type_name, initial.strip() or None, block)


class Program:
    def __init__(self, source, filename="<ST>"):
        self.source, self.filename = source, filename
        self.declarations = tuple(declarations(source))
        match = re.search(r"(?:METHOD\s+(?:PRIVATE\s+|PUBLIC\s+)?|FUNCTION\s+)(\w+)(?:\s*:\s*(\w+))?", source)
        self.name, self.result_type = (match[1], match[2]) if match else (None, None)
        parser = Parser(source.split(MARKER)[-1])
        self.python = "\n".join(parser.statements()) + "\n"
        if parser.peek():
            raise SyntaxError(f"Unparsed ST in {filename}: {parser.peek()}")
        self.code = compile(self.python, str(filename), "exec")

    def execute(self, state):
        try:
            exec(self.code, HELPERS, state)
        except StReturn:
            pass


class Registry:
    def __init__(self, clock=None, root=PLC_ROOT):
        self.root, self.clock = root, clock or Clock()
        self.sources, self.enums, self.programs = {}, {}, {}
        for path in (root / "ST").rglob("*.st"):
            source = clean(path.read_text(encoding="utf-8-sig"))
            match = re.search(r"\bTYPE\s+(\w+)\s*:\s*(.*?)END_TYPE", source, re.S)
            if not match:
                continue
            name, body = match.groups(); self.sources[name] = body
            if body.strip().startswith("("):
                values, next_value = {}, 0
                for item in body.strip()[1:body.index(")")].split(","):
                    if not item.strip():
                        continue
                    pieces = item.strip().split(":=")
                    value = int(literals(pieces[1]).strip()) if len(pieces) == 2 else next_value
                    values[pieces[0].strip()] = value; next_value = value + 1
                self.enums[name] = SimpleNamespace(**values)

    def program(self, relative):
        if relative not in self.programs:
            path = self.root / relative
            self.programs[relative] = Program(path.read_text(encoding="utf-8-sig"), path)
        return self.programs[relative]

    def evaluate(self, expression, environment):
        parser = Parser(expression); python = parser.expression()
        if parser.peek():
            raise SyntaxError(f"Unsupported initializer: {expression}")
        return eval(python, HELPERS, {**self.enums, **environment})

    def value(self, type_name, environment):
        if type_name in INTEGER_TYPES:
            return 0
        if type_name == "BOOL":
            return False
        if type_name in ("REAL", "LREAL"):
            return 0.0
        if type_name.startswith(("STRING", "WSTRING")):
            return ""
        if type_name in self.enums:
            return next(iter(vars(self.enums[type_name]).values()))
        if type_name == "TON":
            return Ton(self.clock)
        if type_name == "TOF":
            return Tof(self.clock)
        if type_name == "TP":
            return Tp(self.clock)
        if type_name == "R_TRIG":
            return RisingEdge()
        if type_name == "F_TRIG":
            return FallingEdge()
        array = re.fullmatch(r"ARRAY\s*\[(.*?)\.\.(.*?)\]\s*OF\s+(\w+)", type_name, re.I)
        if array:
            low, high = [int(self.evaluate(s, environment)) for s in array.group(1, 2)]
            return StArray(low, [self.value(array[3], environment) for _ in range(high - low + 1)], array[3])
        if type_name.startswith("FB_"):
            paths = list((self.root / "FB").rglob(type_name + ".st"))
            if len(paths) != 1:
                raise TypeError(f"Unknown/ambiguous function block {type_name}")
            return Block(self, paths[0].relative_to(self.root).as_posix(), environment)
        body = self.sources.get(type_name)
        if body is None:
            raise TypeError(f"Unsupported ST type {type_name}")
        if not body.strip().startswith("STRUCT"):
            return self.value(body.strip().rstrip(";"), environment)
        fields = [Declaration(n, t, initial.strip() or None) for n, t, initial in DECLARATION.findall(body)]
        values = self.initialize(fields, environment)
        return Record({d.name: d.type for d in fields}, values)

    def initialize(self, decls, environment):
        values = {}
        for declaration in decls:
            value = self.value(declaration.type, {**environment, **values})
            if declaration.initial:
                value = self.initializer(value, declaration.initial, declaration.type, {**environment, **values})
            values[declaration.name] = value
        return values

    def initializer(self, value, source, type_name, environment):
        if isinstance(value, StArray):
            if not source.startswith("[") or not source.endswith("]"):
                raise SyntaxError(f"Unsupported array initializer: {source}")
            items = split_items(source[1:-1])
            if len(items) > len(value.values):
                raise ValueError("Too many ST array initializers")
            for offset, item in enumerate(items):
                value.values[offset] = self.initializer(value.values[offset], item, value.item_type, environment)
            return value
        if isinstance(value, Record):
            if not source.startswith("(") or not source.endswith(")"):
                raise SyntaxError(f"Unsupported STRUCT initializer: {source}")
            for item in split_items(source[1:-1]):
                name, expression = item.split(":=", 1)
                name = name.strip()
                setattr(value, name, self.initializer(getattr(value, name), expression.strip(), value._types[name], environment))
            return value
        return cast(type_name, self.evaluate(source, environment))


def split_items(source):
    result, start, depth = [], 0, 0
    for at, char in enumerate(source):
        if char in "([":
            depth += 1
        elif char in ")]":
            depth -= 1
        elif char == "," and depth == 0:
            if source[start:at].strip():
                result.append(source[start:at].strip())
            start = at + 1
    if source[start:].strip():
        result.append(source[start:].strip())
    return result


class Block:
    """Persistent FB variables; method locals are new for each method call."""

    def __init__(self, registry, relative, globals):
        object.__setattr__(self, "registry", registry)
        object.__setattr__(self, "program", registry.program(relative))
        object.__setattr__(self, "state", {**registry.enums, **globals})
        types = {d.name: d.type for d in self.program.declarations}
        self.state.update(registry.initialize(self.program.declarations, self.state))
        self.state["_types"] = types
        path = Path(relative)
        for method in (registry.root / path.parent).glob(path.stem + ".*.st"):
            program = registry.program(method.relative_to(registry.root).as_posix())
            self.state[program.name] = self._method(program)

    def _method(self, program):
        def call(**args):
            local_names = {d.name for d in program.declarations}
            unknown = set(args) - {d.name for d in program.declarations if d.block in ("VAR_INPUT", "VAR_IN_OUT")}
            if unknown:
                raise TypeError(f"Unexpected arguments to {program.name}: {unknown}")
            local = {**self.state, **self.registry.initialize([d for d in program.declarations if d.name not in args], self.state)}
            argument_decls = {d.name: d for d in program.declarations}
            local.update({name: value if argument_decls[name].block == "VAR_IN_OUT" else cast(argument_decls[name].type, value)
                          for name, value in args.items()})
            local["_types"] = {**self.state["_types"], **{d.name: d.type for d in program.declarations}}
            if program.result_type:
                local[program.name] = self.registry.value(program.result_type, self.state)
                local["_types"][program.name] = program.result_type
            program.execute(local)
            for name in self.state["_types"]:
                if name not in local_names:
                    self.state[name] = local[name]
            return local.get(program.name) if program.result_type else None
        return call

    def __call__(self, **args):
        in_out = {d.name for d in self.program.declarations if d.block == "VAR_IN_OUT"}
        for name, value in args.items():
            if name not in self.state["_types"]:
                raise TypeError(f"Undeclared FB input: {name}")
            self.state[name] = value if name in in_out else cast(self.state["_types"][name], value)
        self.program.execute(self.state)

    def __getattr__(self, name):
        try:
            return self.state[name]
        except KeyError as error:
            raise AttributeError(name) from error

    def __setattr__(self, name, value):
        if name not in self.state["_types"]:
            raise AttributeError(f"Undeclared FB variable: {name}")
        self.state[name] = cast(self.state["_types"][name], value)
