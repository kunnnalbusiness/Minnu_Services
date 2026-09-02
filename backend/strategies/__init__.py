"""Standalone strategy definitions.

This package keeps each strategy in its own module so they can be evolved independently.
"""

from .Strategy2 import Strategy2
from .Strategy3 import Strategy3
from .Strategy4 import Strategy4

__all__ = [
    "Strategy2",
    "Strategy3",
    "Strategy4",
]
