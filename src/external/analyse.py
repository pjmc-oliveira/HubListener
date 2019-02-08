import sys
import json

def analyse(paths):
    # YOUR CODE HERE
    # return a python dictionary
    return {}

if __name__ == '__main__':
    # First system argument should be script name
    paths = sys.argv[1:]
    results = analyse(paths)
    print(json.dumps(results))