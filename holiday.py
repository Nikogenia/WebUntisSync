from dataclasses import dataclass


@dataclass
class Holiday:

    id: int
    name: str
    long_name: str
    start_date: str
    end_date: str
