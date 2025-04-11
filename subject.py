from dataclasses import dataclass


@dataclass
class Subject:

    id: int
    name: str
    long_name: str
    alternate_name: str
    active: bool
    fore_color: str
    back_color: str
