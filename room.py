from dataclasses import dataclass


@dataclass
class Room:

    id: int
    name: str
    long_name: str
    active: bool
    building: str
