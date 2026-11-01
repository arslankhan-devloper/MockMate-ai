import type { RoadmapDomain } from './types'

export const itDomain: RoadmapDomain = {
  id: 'it',
  title: 'IT / Software',
  shortLabel: 'IT / Software',
  description: 'Build durable foundations in data structures, algorithms, databases, systems, and software design.',
  accent: '#3b82f6',
  topics: [
    {
      id: 'complexity-and-data-structures',
      title: 'Complexity and core data structures',
      summary: 'Reason about running time and choose the data structure that matches the operations you perform most often.',
      estimatedMinutes: 35,
      notes: [
        'Big-O describes how an algorithm grows as its input grows. Constants and small terms are dropped: 3n + 20 is O(n). It is a tool for comparing growth, not for predicting exact milliseconds on a particular machine.',
        'Arrays provide contiguous storage and O(1) access by index, but inserting or removing in the middle shifts elements and costs O(n). Linked lists make middle insertion O(1) once the position is known, but lose random access and add pointer overhead.',
        'A hash table maps keys to values with average O(1) lookup, insertion, and deletion. Its worst case is O(n) when many keys collide. It trades extra memory and hashing cost for fast key-based access.',
        'Stacks follow last-in-first-out and queues follow first-in-first-out. They are useful when the order of processing matters, such as undo histories, breadth-first traversal, or task scheduling.',
      ],
      example: {
        title: 'Two-sum: from quadratic to linear',
        body: 'For an array of n numbers and a target, a nested loop checks every pair in O(n^2). Instead, scan once and keep a hash map from value to index. For each value x, check whether target - x was already seen. Each lookup is average O(1), so the whole solution is O(n) time and O(n) extra space.',
      },
      practice: [
        {
          id: 'hash-average-worst',
          prompt: 'Why can a hash table be O(1) on average but O(n) in the worst case?',
          difficulty: 'Easy',
          answer: 'Average O(1) assumes keys spread across buckets with few collisions. If many keys hash to the same bucket, the table must scan a long collision chain, so lookup can degrade to O(n).',
          explanation: 'The complexity depends on the hash function, load factor, and collision strategy. Rehashing and a bounded load factor keep the average case fast but cannot guarantee it for every input.',
        },
        {
          id: 'array-middle-insert',
          prompt: 'Why is inserting an element at the beginning of a dynamic array usually O(n)?',
          difficulty: 'Easy',
          answer: 'Existing elements must be shifted one position to the right to create a free slot, so the work grows with the number of elements.',
          explanation: 'The occasional resize also costs O(n), but even without resizing, preserving contiguous order requires moving every existing element.',
        },
      ],
    },
    {
      id: 'algorithms-and-problem-solving',
      title: 'Algorithms and problem-solving patterns',
      summary: 'Recognize the small set of patterns that solve most interview problems and learn when each pattern is valid.',
      estimatedMinutes: 45,
      notes: [
        'Start by restating the input, output, constraints, and edge cases. A pattern is useful only when its preconditions hold. Two pointers usually need ordered data; binary search needs a monotonic predicate; dynamic programming needs overlapping subproblems and an optimal substructure.',
        'Sliding-window problems maintain a contiguous range and adjust its boundaries instead of recomputing the range from scratch. The key question is what information must be updated when the window grows or shrinks.',
        'Breadth-first search explores by distance and finds shortest paths in unweighted graphs. Depth-first search is better for exhaustive exploration, cycle detection, and topological ordering. Both are O(V + E) when implemented with a visited set.',
        'Dynamic programming stores answers to overlapping subproblems. Define the state, the recurrence, the base cases, and the order of computation before writing code. If the state is unclear, the implementation will usually be wrong.',
      ],
      example: {
        title: 'Longest substring without repeating characters',
        body: 'Keep a window [left, right] and a map from character to its most recent index. Expand right one character at a time. If the character is already inside the window, move left to one position after its previous occurrence. The answer is the largest window seen. Each index enters and leaves the window once, so the algorithm is O(n).',
      },
      practice: [
        {
          id: 'binary-search-precondition',
          prompt: 'What must be true before binary search can be applied to an array?',
          difficulty: 'Easy',
          answer: 'The search space must be ordered or, more generally, there must be a monotonic predicate that is false up to a boundary and true after it.',
          explanation: 'Binary search discards half the remaining space based on that monotonic property. On an arbitrary unsorted array, the discard step is not justified.',
        },
        {
          id: 'bfs-shortest-path',
          prompt: 'Why does BFS find a shortest path in an unweighted graph?',
          difficulty: 'Medium',
          answer: 'BFS visits nodes in nondecreasing distance from the source. The first time a node is reached, no shorter route can remain undiscovered.',
          explanation: 'Every edge has the same cost, so exploring by layers guarantees the minimum number of edges. With weighted edges, a priority queue such as Dijkstra is needed instead.',
        },
      ],
    },
    {
      id: 'databases-and-apis',
      title: 'Databases, transactions, and APIs',
      summary: 'Model relational data, reason about indexes and transactions, and design predictable HTTP APIs.',
      estimatedMinutes: 40,
      notes: [
        'Relational modeling separates entities and relationships, uses primary keys for identity, and foreign keys for referential integrity. Normalization reduces duplicated facts; deliberate denormalization can improve read performance at the cost of consistency work.',
        'An index is a separate structure that speeds up selective reads but adds write cost and storage. Composite indexes are ordered, so a query can use a leading prefix of the index columns. A query that filters only on a later column usually cannot use that index efficiently.',
        'A transaction groups operations into one atomic unit. ACID properties protect against partial writes, inconsistent reads, and lost updates. Choose isolation and locking based on the invariants that must hold, not by habit.',
        'HTTP APIs should have predictable resources, status codes, validation, pagination, and idempotency where retries are possible. PUT and DELETE are normally idempotent; POST is not. An idempotency key lets a client safely retry a create request.',
      ],
      example: {
        title: 'Composite index order matters',
        body: 'For a table of job applications, an index on (student_id, status, applied_at) can support queries that filter by student_id, or by student_id and status, while also sorting by applied_at. A query that filters only by status cannot use the index as effectively because student_id is the leading column.',
      },
      practice: [
        {
          id: 'index-write-cost',
          prompt: 'Why can adding an index make writes slower?',
          difficulty: 'Easy',
          answer: 'Every insert, update, or delete may need to update the index as well as the table, adding work and storage.',
          explanation: 'Indexes trade faster reads for slower writes and more space. The right choice depends on the read/write mix and the selectivity of the queries.',
        },
        {
          id: 'idempotency-key',
          prompt: 'What problem does an idempotency key solve for a POST endpoint?',
          difficulty: 'Medium',
          answer: 'It lets the server recognize a retried request and return the original result instead of creating a duplicate record.',
          explanation: 'Network timeouts make clients retry even when the first request succeeded. A unique key stored with the operation turns the retry into a safe lookup.',
        },
      ],
    },
    {
      id: 'operating-systems-and-networks',
      title: 'Operating systems and networks',
      summary: 'Understand how processes, memory, and network protocols affect application performance and reliability.',
      estimatedMinutes: 35,
      notes: [
        'A process has its own virtual address space. Threads within a process share that address space and open resources but have their own stacks and execution state. Sharing makes communication cheap but creates race conditions that require synchronization.',
        'Scheduling decides which runnable thread uses a CPU. Blocking a thread on I/O wastes its scheduling slot, while asynchronous or nonblocking I/O lets one thread manage many connections. Virtual memory maps addresses to physical pages and allows paging and isolation.',
        'TCP provides reliable, ordered, connection-oriented delivery with flow control and congestion control. UDP is connectionless and does not guarantee delivery or order, which is useful for latency-sensitive traffic that can tolerate loss. TLS adds encryption and authentication on top of a transport.',
        'DNS resolves names to addresses, HTTP carries application requests, and caches reduce repeated work. Cache correctness depends on keys, expiry, and invalidation. A CDN caches content close to users but must respect freshness and privacy requirements.',
      ],
      example: {
        title: 'Tracing a page request',
        body: 'A browser first resolves the hostname through DNS, establishes a TCP connection and TLS session, then sends the HTTP request. The server may query a database or cache, render a response, and return it through the CDN or proxy. Each stage adds latency and each cache can fail or serve stale data, so timeouts and observability matter.',
      },
      practice: [
        {
          id: 'process-thread-memory',
          prompt: 'What do threads in the same process share, and what do they not share?',
          difficulty: 'Easy',
          answer: 'They share the process address space and resources such as open files, but each thread has its own stack, registers, and execution state.',
          explanation: 'Shared memory enables fast communication but means unsynchronized writes can corrupt shared data. Per-thread stacks keep local call state separate.',
        },
        {
          id: 'tcp-vs-udp',
          prompt: 'When would UDP be a better choice than TCP?',
          difficulty: 'Medium',
          answer: 'When low latency matters more than guaranteed delivery, such as live audio or video, telemetry, or a protocol that implements its own recovery.',
          explanation: 'UDP avoids connection setup and head-of-line blocking at the transport layer. The application must then handle loss, ordering, and duplication where needed.',
        },
      ],
    },
    {
      id: 'system-design-foundations',
      title: 'System design foundations',
      summary: 'Turn vague requirements into a bounded design with clear components, bottlenecks, and failure behavior.',
      estimatedMinutes: 45,
      notes: [
        'Clarify functional requirements, scale, latency, availability, and consistency before drawing components. A design that ignores the dominant read/write pattern or consistency requirement is usually solving the wrong problem.',
        'Estimate orders of magnitude: users, requests per second, storage per year, and peak-to-average ratio. Rough estimates expose whether a single database, a cache, or a partitioned system is appropriate.',
        'Separate stateless application servers from stateful storage. Add caches for repeated reads, queues for asynchronous work, and replicas for read scaling or availability. Each addition introduces new failure modes, consistency questions, and operational cost.',
        'Design for failure: timeouts, retries with backoff, idempotency, health checks, and monitoring. Decide which operations can be eventually consistent and which require a stronger guarantee. State the trade-off instead of claiming a system is simply scalable.',
      ],
      example: {
        title: 'Designing a URL shortener',
        body: 'The core operations are creating a short code for a long URL and redirecting a short code. Generate a unique code, store the mapping with an expiry policy, and cache popular codes in front of the database. Redirects are read-heavy and should be fast; creation needs idempotency or collision handling. Analytics can be queued asynchronously so a redirect does not wait for logging.',
      },
      practice: [
        {
          id: 'cache-invalidation',
          prompt: 'Why is cache invalidation difficult in a read-heavy system?',
          difficulty: 'Medium',
          answer: 'Multiple caches and database replicas can hold different versions, and there is no single instant at which every copy updates. The system must choose a freshness strategy and tolerate stale reads.',
          explanation: 'TTL-based expiry is simple but can serve stale data. Explicit invalidation is fresher but must be ordered correctly and handle missed messages. The right choice depends on how harmful stale data is.',
        },
        {
          id: 'queue-purpose',
          prompt: 'What does a message queue let a system do that a direct synchronous call does not?',
          difficulty: 'Easy',
          answer: 'It decouples the producer from the consumer, absorbs bursts, and allows work to be retried or processed later without keeping the original request open.',
          explanation: 'The trade-off is eventual completion, duplicate delivery, ordering complexity, and the need to monitor backlog and dead-letter queues.',
        },
      ],
    },
  ],
}
