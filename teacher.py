from dataclasses import dataclass


@dataclass
class Teacher:

    id: int
    name: str
    fore_name: str
    long_name: str
    titel: str
    active: bool
