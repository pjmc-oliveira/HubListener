import sys
import json
from radon.complexity import cc_rank, SCORE
from radon.cli.harvest import CCHarvester
from radon.cli.harvest import RawHarvester
from radon.cli.harvest import MIHarvester
from radon.cli.harvest import HCHarvester
from radon.cli import Config
from radon.cli.tools import (iter_filenames, _open, cc_to_dict, dict_to_xml,
                             dict_to_codeclimate_issues, cc_to_terminal,
                             raw_to_dict)
from collections import defaultdict
from itertools import chain

def analyse(paths):

    #Setup the Configuration 
    config = Config(
        exclude=[],
        ignore=[],
        order=SCORE,
        no_assert= False,
        show_closures=False,
        min='A',
        max='F',
    )

    config2 = Config(
        exclude=[],
        ignore=[],
        by_function= False
    )

    config3 = Config(
        min= 'A',
        max= 'C',
        exclude=[],
        ignore=[],
        multi=True,
        show=True,
    )

    config4 = Config(
        exclude=[],
        ignore=[],
        summary=False,
        json=True,
    )
    
    #Retursn Dictionary
    h = CCHarvester(paths, config)
    ccResults = h._to_dicts()
    
    # Returns JSON without key value pair... 
    i = HCHarvester(paths, config2)
    hcResults = i._to_dicts()
  
    j = MIHarvester(paths, config3)
    miResults = dict(j.filtered_results)

    k = RawHarvester(paths, config4)
    rawResults = (dict(k.results))

    return [ccResults, hcResults, miResults, rawResults]
 

def merge(*dicts):
    merged = defaultdict(list)
    items = chain(*(d.items() for d in dicts))
    for k, v in items:
        merged[k].extend(v)
    return merged


if __name__ == '__main__':
    # First system argument should be script name
    paths = sys.argv[1:]
    results = analyse(paths)
    print(json.dumps(results[0]))









