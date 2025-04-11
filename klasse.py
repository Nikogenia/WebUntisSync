from dataclasses import dataclass
from teacher import Teacher


@dataclass
class Klasse:

    id: int
    name: str
    long_name: str
    active: bool
    teachers: list[Teacher]
