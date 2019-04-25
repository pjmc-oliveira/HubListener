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

    #Setup the Configuration for each Harvester 
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
    


    """
    ----------------------
    Cyclomatic Complexity 
    ---------------------
    Cyclomatic Complexity corresponds to the number of decisions a block of code contains plus 1. 
    This number (also called McCabe number) is equal to the number of linearly independent paths through the code. 
    This number can be used as a guide when testing conditional logic in blocks.Radon analyzes the AST tree 
    of a Python program to compute Cyclomatic Complexity. Statements have the following effects on Cyclomatic Complexity:
    """
    
    h = CCHarvester(paths, config)
    ccResults = h._to_dicts()
    # print(ccResults)
    numOfFunctions = 0
    complexity = 0

    # for result in ccResults.values():
    #     numOfFunctions += 1
    #     complexity += result['complexity'] if isinstance(result, dict) else 0

    for path in paths:
        for i in ccResults.get(path, []):
            numOfFunctions += 1
            complexity += i["complexity"] if isinstance(i, dict) else 0

    cc = complexity/numOfFunctions if numOfFunctions != 0 else 0

    """
    -------------------
    Halstead's Metrics
    ------------------
    Halstead’s goal was to identify measurable properties of software, and the relations between them. 
    These numbers are statically computed from the source code: Effort, Bugs, Length, Difficulty, Time, Vocabulary , Volume
    """
    i = HCHarvester(paths, config2)
    hcResults = i._to_dicts()
  
    halsteadEffort = 0
    halsteadBugs = 0
    halsteadLength = 0 
    halsteadDifficulty = 0
    halsteadTime = 0
    halsteadVocabulary = 0 
    halsteadVolume = 0
    numberOfFiles = 0

    for result in hcResults.values():
        if 'total' in result:
            halsteadEffort += result["total"][9]
            halsteadBugs  += result["total"][11]
            halsteadLength  += result["total"][5]
            halsteadDifficulty += result["total"][8]
            halsteadTime += result["total"][10]
            halsteadVocabulary += result["total"][4]
            halsteadVolume += result["total"][7]
        numberOfFiles += 1

    avgHalsteadEffort = halsteadEffort/numberOfFiles
    avgHalsteadBugs = halsteadBugs/numberOfFiles
    avgHalsteadLength = halsteadLength /numberOfFiles
    avgHalsteadDifficulty = halsteadDifficulty/numberOfFiles
    avgHalsteadTime = halsteadTime/numberOfFiles
    avgHalsteadVocabulary = halsteadVocabulary/numberOfFiles
    avgHalsteadVolume = halsteadVolume/numberOfFiles

    
    """
    ---------------------------------------
    MI Harvester for Maintainability index
    --------------------------------------
    Maintainability Index is a software metric which measures how maintainable (easy to support and change)
    the source code is. The maintainability index is calculated as a factored formula consisting of SLOC (Source Lines Of Code),
    Cyclomatic Complexity and Halstead volume. It is used in several automated software metric tools, including the Microsoft 
    Visual Studio 2010 development environment, which uses a shifted scale (0 to 100) derivative.
    """
    j = MIHarvester(paths, config3)
    miResults = dict(j.filtered_results)

    miVal = 0 
    numOfFiles = 0
    for result in miResults.values():
        if 'mi' in result:
            miVal += result["mi"] 
        numOfFiles += 1

    mi = miVal/numOfFiles
    


    """
    ------------
    Raw Metrics
    -----------
    The following are the definitions employed by Radon:
     - LOC: The total number of lines of code. It does not necessarily correspond to the number of lines in the file.
     - LLOC: The number of logical lines of code. Every logical line of code contains exactly one statement.
     - SLOC: The number of source lines of code - not necessarily corresponding to the LLOC. [sloc]
     - Comments: The number of comment lines. Multi-line strings are not counted as comment since, to the Python interpreter, they are just strings.
     - Multi: The number of lines which represent multi-line strings.  [multi] 
     - Blanks: The number of blank lines (or whitespace-only ones).  [blank]
    """
    k = RawHarvester(paths, config4)
    rawResults = (dict(k.results))

    comments = 0
    lloc = 0
    loc = 0
    for result in rawResults.values():
        if 'comments' in result:
            comments += result['comments']
        if 'lloc' in result:
            lloc += result['lloc']
        if 'loc' in result:
            loc += result['loc']


    data = {
        "numberOfFiles" : len(paths),
        "numberOfLines" : loc,
        "numberOfLogicalLines" : lloc, 
        "numberOfComments" : comments, 
        "cyclomaticComplexity" : cc, 
        "maintainabilityIndex" : mi,
        "halsteadEffort" : avgHalsteadEffort,
        "halsteadBugs" : avgHalsteadBugs,
        "halsteadLength" :avgHalsteadLength,
        "halsteadDifficulty" : avgHalsteadDifficulty,
        "halsteadTime" : avgHalsteadTime, 
        "halsteadVocabulary" : avgHalsteadVocabulary, 
        "halsteadVolume" : avgHalsteadVolume
    }

    return data

if __name__ == '__main__':
    # First system argument should be script name
    paths = sys.argv[1:]
    results = analyse(paths)
    print(json.dumps(results))









