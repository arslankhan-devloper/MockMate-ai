// Curated, original practice problems for the Problem Solving workspace.
// Statements and examples here are written for MockMate and are not copied from
// any third-party platform. Keep the array shape stable; the UI renders directly
// from it and can be extended by adding more entries.

export type Difficulty = 'Easy' | 'Medium' | 'Hard'
export type Language = 'C' | 'C++' | 'Java' | 'Python'

export interface ProblemExample {
  input: string
  output: string
  explanation?: string
}

export interface ProblemTestCase {
  input: string
  expected: string
}

export interface Problem {
  id: string
  title: string
  difficulty: Difficulty
  tags: string[]
  description: string
  examples: ProblemExample[]
  constraints: string[]
  hints: string[]
  testCases: ProblemTestCase[]
  starterCode: Record<Language, string>
}

export const languages: Language[] = ['C', 'C++', 'Java', 'Python']

export const monacoLang: Record<Language, string> = {
  'C': 'cpp',
  'C++': 'cpp',
  'Java': 'java',
  'Python': 'python',
}

export const problems: Problem[] = [
  {
    id: 'pair-sum',
    title: 'Pair Sum',
    difficulty: 'Easy',
    tags: ['Array', 'Hash Map'],
    description: `Given an array of integers \`nums\` and an integer \`target\`, return the indices of the two numbers that add up to \`target\`.

Exactly one valid pair exists, and you may not use the same element twice. Indices may be returned in any order.`,
    examples: [
      { input: 'nums = [2, 7, 11, 15], target = 9', output: '[0, 1]', explanation: 'nums[0] + nums[1] = 2 + 7 = 9.' },
      { input: 'nums = [3, 2, 4], target = 6', output: '[1, 2]', explanation: 'nums[1] + nums[2] = 2 + 4 = 6.' },
    ],
    constraints: ['2 ≤ nums.length ≤ 10⁴', '-10⁹ ≤ nums[i] ≤ 10⁹', 'Exactly one valid pair exists.'],
    hints: [
      'A single pass is enough — think about what you can remember as you go.',
      'A hash map (dictionary) can store each value you have already seen.',
      'For each value, check whether (target - value) is already in your map.',
    ],
    testCases: [
      { input: '[2, 7, 11, 15], 9', expected: '[0, 1]' },
      { input: '[3, 2, 4], 6', expected: '[1, 2]' },
      { input: '[3, 3], 6', expected: '[0, 1]' },
    ],
    starterCode: {
      'C': `/**
 * Return the two indices that add up to target.
 * Report the result length through *returnSize.
 */
int* pairSum(int* nums, int numsSize, int target, int* returnSize) {
    // Write your solution here
    *returnSize = 0;
    return NULL;
}`,
      'C++': `class Solution {
public:
    vector<int> pairSum(vector<int>& nums, int target) {
        // Write your solution here
        return {};
    }
};`,
      'Java': `class Solution {
    public int[] pairSum(int[] nums, int target) {
        // Write your solution here
        return new int[]{};
    }
}`,
      'Python': `from typing import List


class Solution:
    def pairSum(self, nums: List[int], target: int) -> List[int]:
        # Write your solution here
        return []`,
    },
  },
  {
    id: 'most-frequent',
    title: 'Most Frequent Element',
    difficulty: 'Easy',
    tags: ['Array', 'Hash Map'],
    description: `Given an array of integers, return the element that appears most frequently. If several elements tie for the highest count, return the smallest of them.`,
    examples: [
      { input: 'nums = [1, 3, 1, 2, 1]', output: '1', explanation: '1 appears three times, more than any other value.' },
      { input: 'nums = [4, 4, 2, 2, 1]', output: '2', explanation: '2 and 4 both appear twice; 2 is the smaller value.' },
    ],
    constraints: ['1 ≤ nums.length ≤ 10⁵', '-10⁹ ≤ nums[i] ≤ 10⁹'],
    hints: [
      'Count how many times each value occurs.',
      'When counts tie, compare the actual values to keep the smaller one.',
    ],
    testCases: [
      { input: '[1, 3, 1, 2, 1]', expected: '1' },
      { input: '[4, 4, 2, 2, 1]', expected: '2' },
      { input: '[7]', expected: '7' },
    ],
    starterCode: {
      'C': `int mostFrequent(int* nums, int numsSize) {
    // Write your solution here
    return 0;
}`,
      'C++': `class Solution {
public:
    int mostFrequent(vector<int>& nums) {
        // Write your solution here
        return 0;
    }
};`,
      'Java': `class Solution {
    public int mostFrequent(int[] nums) {
        // Write your solution here
        return 0;
    }
}`,
      'Python': `from typing import List


class Solution:
    def mostFrequent(self, nums: List[int]) -> int:
        # Write your solution here
        return 0`,
    },
  },
  {
    id: 'reverse-words',
    title: 'Reverse the Words',
    difficulty: 'Easy',
    tags: ['String'],
    description: `Given a sentence, reverse the order of the words. Words are separated by one or more spaces and the result must be trimmed, with a single space between words.`,
    examples: [
      { input: 's = "the sky is blue"', output: '"blue is sky the"' },
      { input: 's = "  hello   world  "', output: '"world hello"', explanation: 'Extra spaces are collapsed.' },
    ],
    constraints: ['1 ≤ s.length ≤ 10⁴', 's contains English letters, digits and spaces.'],
    hints: [
      'Splitting on whitespace ignores repeated spaces automatically.',
      'Reverse the list of words and join with a single space.',
    ],
    testCases: [
      { input: '"the sky is blue"', expected: '"blue is sky the"' },
      { input: '"  hello   world  "', expected: '"world hello"' },
      { input: '"one"', expected: '"one"' },
    ],
    starterCode: {
      'C': `// Return the words of the sentence in reverse order.
char* reverseWords(char* s) {
    // Write your solution here
    return s;
}`,
      'C++': `class Solution {
public:
    string reverseWords(string s) {
        // Write your solution here
        return s;
    }
};`,
      'Java': `class Solution {
    public String reverseWords(String s) {
        // Write your solution here
        return s;
    }
}`,
      'Python': `class Solution:
    def reverseWords(self, s: str) -> str:
        # Write your solution here
        return s`,
    },
  },
  {
    id: 'longest-unique-substring',
    title: 'Longest Unique Substring',
    difficulty: 'Medium',
    tags: ['String', 'Sliding Window'],
    description: `Given a string, return the length of the longest substring that contains no repeating characters.`,
    examples: [
      { input: 's = "abcabcbb"', output: '3', explanation: 'The answer is "abc", with length 3.' },
      { input: 's = "bbbbb"', output: '1', explanation: 'The answer is "b", with length 1.' },
      { input: 's = "pwwkew"', output: '3', explanation: 'The answer is "wke", with length 3.' },
    ],
    constraints: ['0 ≤ s.length ≤ 10⁵', 's contains English letters, digits, symbols and spaces.'],
    hints: [
      'Use a sliding window that always stays free of duplicates.',
      'Store the last index of each character so you can move the window start quickly.',
    ],
    testCases: [
      { input: '"abcabcbb"', expected: '3' },
      { input: '"bbbbb"', expected: '1' },
      { input: '"pwwkew"', expected: '3' },
    ],
    starterCode: {
      'C': `int longestUniqueSubstring(char* s) {
    // Write your solution here
    return 0;
}`,
      'C++': `class Solution {
public:
    int longestUniqueSubstring(string s) {
        // Write your solution here
        return 0;
    }
};`,
      'Java': `class Solution {
    public int longestUniqueSubstring(String s) {
        // Write your solution here
        return 0;
    }
}`,
      'Python': `class Solution:
    def longestUniqueSubstring(self, s: str) -> int:
        # Write your solution here
        return 0`,
    },
  },
  {
    id: 'first-last-occurrence',
    title: 'First and Last Occurrence',
    difficulty: 'Medium',
    tags: ['Searching', 'Array', 'Binary Search'],
    description: `Given a sorted array of integers and a target value, return the first and last index at which the target appears. If the target is not present, return [-1, -1].`,
    examples: [
      { input: 'nums = [5, 7, 7, 8, 8, 10], target = 8', output: '[3, 4]' },
      { input: 'nums = [5, 7, 7, 8, 8, 10], target = 6', output: '[-1, -1]' },
    ],
    constraints: ['0 ≤ nums.length ≤ 10⁵', 'nums is sorted in non-decreasing order.'],
    hints: [
      'A linear scan works, but the sorted input allows binary search.',
      'Run two binary searches: one biased left for the first index, one biased right for the last.',
    ],
    testCases: [
      { input: '[5, 7, 7, 8, 8, 10], 8', expected: '[3, 4]' },
      { input: '[5, 7, 7, 8, 8, 10], 6', expected: '[-1, -1]' },
      { input: '[1, 1, 1], 1', expected: '[0, 2]' },
    ],
    starterCode: {
      'C': `/**
 * Write the first and last index of target into out[0] and out[1].
 * If target is absent, set both to -1.
 */
void firstLastOccurrence(int* nums, int numsSize, int target, int* out) {
    // Write your solution here
    out[0] = -1;
    out[1] = -1;
}`,
      'C++': `class Solution {
public:
    vector<int> firstLastOccurrence(vector<int>& nums, int target) {
        // Write your solution here
        return {-1, -1};
    }
};`,
      'Java': `class Solution {
    public int[] firstLastOccurrence(int[] nums, int target) {
        // Write your solution here
        return new int[]{-1, -1};
    }
}`,
      'Python': `from typing import List


class Solution:
    def firstLastOccurrence(self, nums: List[int], target: int) -> List[int]:
        # Write your solution here
        return [-1, -1]`,
    },
  },
  {
    id: 'merge-intervals',
    title: 'Merge Overlapping Intervals',
    difficulty: 'Medium',
    tags: ['Sorting', 'Array'],
    description: `Given a list of intervals [start, end], merge all overlapping intervals and return the resulting list sorted by start time. Two intervals overlap when the second starts at or before the first ends.`,
    examples: [
      { input: 'intervals = [[1, 3], [2, 6], [8, 10], [15, 18]]', output: '[[1, 6], [8, 10], [15, 18]]', explanation: '[1, 3] and [2, 6] overlap and merge into [1, 6].' },
      { input: 'intervals = [[1, 4], [4, 5]]', output: '[[1, 5]]', explanation: 'Touching intervals merge.' },
    ],
    constraints: ['1 ≤ intervals.length ≤ 10⁴', 'start ≤ end for every interval'],
    hints: [
      'Start by sorting the intervals by their start value.',
      'Walk through the sorted list and extend the current interval whenever the next one overlaps it.',
    ],
    testCases: [
      { input: '[[1, 3], [2, 6], [8, 10], [15, 18]]', expected: '[[1, 6], [8, 10], [15, 18]]' },
      { input: '[[1, 4], [4, 5]]', expected: '[[1, 5]]' },
      { input: '[[1, 2]]', expected: '[[1, 2]]' },
    ],
    starterCode: {
      'C': `/**
 * intervals holds count pairs as [2*i] = start, [2*i + 1] = end.
 * Return the number of merged intervals and write them into out.
 */
int mergeIntervals(int* intervals, int count, int* out) {
    // Write your solution here
    return 0;
}`,
      'C++': `class Solution {
public:
    vector<vector<int>> mergeIntervals(vector<vector<int>>& intervals) {
        // Write your solution here
        return {};
    }
};`,
      'Java': `class Solution {
    public int[][] mergeIntervals(int[][] intervals) {
        // Write your solution here
        return new int[][]{};
    }
}`,
      'Python': `from typing import List


class Solution:
    def mergeIntervals(self, intervals: List[List[int]]) -> List[List[int]]:
        # Write your solution here
        return []`,
    },
  },
  {
    id: 'palindrome-number',
    title: 'Palindrome Number',
    difficulty: 'Easy',
    tags: ['Math'],
    description: `Given an integer \`x\`, return true if \`x\` reads the same forwards and backwards, and false otherwise. Negative numbers are never palindromes.`,
    examples: [
      { input: 'x = 121', output: 'true' },
      { input: 'x = -121', output: 'false', explanation: 'The minus sign breaks the symmetry.' },
      { input: 'x = 10', output: 'false' },
    ],
    constraints: ['-2³¹ ≤ x ≤ 2³¹ - 1'],
    hints: [
      'Reversing the number with arithmetic avoids any string allocation.',
      'You only need to reverse half of the digits to detect a palindrome.',
    ],
    testCases: [
      { input: '121', expected: 'true' },
      { input: '-121', expected: 'false' },
      { input: '10', expected: 'false' },
    ],
    starterCode: {
      'C': `#include <stdbool.h>

bool isPalindrome(int x) {
    // Write your solution here
    return false;
}`,
      'C++': `class Solution {
public:
    bool isPalindrome(int x) {
        // Write your solution here
        return false;
    }
};`,
      'Java': `class Solution {
    public boolean isPalindrome(int x) {
        // Write your solution here
        return false;
    }
}`,
      'Python': `class Solution:
    def isPalindrome(self, x: int) -> bool:
        # Write your solution here
        return False`,
    },
  },
  {
    id: 'rolling-sensor-average',
    title: 'Rolling Sensor Average',
    difficulty: 'Easy',
    tags: ['Branch: Signals', 'Sliding Window', 'Array'],
    description: `A sensor records a stream of integer readings. For a window of k consecutive readings, return the average of every such window in order. The window slides one reading at a time and every average is a whole number for the given inputs.`,
    examples: [
      { input: 'readings = [4, 8, 12, 16, 20], k = 3', output: '[8, 12, 16]' },
      { input: 'readings = [10, 20, 30, 40], k = 2', output: '[15, 25, 35]' },
    ],
    constraints: ['1 ≤ k ≤ readings.length ≤ 10⁵', 'All readings are integers; window averages are whole numbers.'],
    hints: [
      'Recompute the whole window each time — it is simple and correct.',
      'To be faster, add the new reading and subtract the one that leaves the window.',
    ],
    testCases: [
      { input: '[4, 8, 12, 16, 20], 3', expected: '[8, 12, 16]' },
      { input: '[10, 20, 30, 40], 2', expected: '[15, 25, 35]' },
      { input: '[6], 1', expected: '[6]' },
    ],
    starterCode: {
      'C': `/**
 * Write the window averages into out and return how many were produced.
 */
int rollingAverage(int* readings, int n, int k, double* out) {
    // Write your solution here
    return 0;
}`,
      'C++': `class Solution {
public:
    vector<double> rollingAverage(vector<int>& readings, int k) {
        // Write your solution here
        return {};
    }
};`,
      'Java': `class Solution {
    public double[] rollingAverage(int[] readings, int k) {
        // Write your solution here
        return new double[]{};
    }
}`,
      'Python': `from typing import List


class Solution:
    def rollingAverage(self, readings: List[int], k: int) -> List[float]:
        # Write your solution here
        return []`,
    },
  },
]
