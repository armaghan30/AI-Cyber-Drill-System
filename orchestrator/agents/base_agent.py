from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Dict, Any


class BaseAgent(ABC):
   

    @abstractmethod
    def act(self, observation: Dict[str, Any]) -> Dict[str, Any]:
        
        raise NotImplementedError
