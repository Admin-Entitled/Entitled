import multiprocessing
import time
import os

def cpu_heavy_task(duration, core_num):
    print(f"Core {core_num}: Stress test started...")
    timeout = time.time() + duration
    # Infinite loop doing math to max out the CPU core
    while time.time() < timeout:
        _ = 5000 * 5000
    print(f"Core {core_num}: Done!")

def memory_heavy_task():
    print("Allocating memory... Watch your RAM usage grow!")
    # Creates a large list in memory (approx 1GB - 2GB depending on system)
    dummy_data = [x for x in range(30000000)]
    print("Memory allocated successfully. Holding for 10 seconds...")
    time.sleep(10)
    del dummy_data
    print("Memory cleared.")

if __name__ == "__main__":
    # 1. Get the number of CPU cores available
    cores = multiprocessing.cpu_count()
    print(f"System detected with {cores} CPU cores.")
    
    # Set how long you want the CPU test to run (in seconds)
    test_duration = 20 
    
    print(f"\n--- STEP 1: CPU STRESS TEST ({test_duration} Seconds) ---")
    print("Open your System Monitor now and watch the CPU usage graph!")
    time.sleep(3) # Gives you a moment to switch to your monitor
    
    processes = []
    for i in range(cores):
        p = multiprocessing.Process(target=cpu_heavy_task, args=(test_duration, i))
        processes.append(p)
        p.start()
        
    for p in processes:
        p.join()
        
    print("\n--- STEP 2: RAM STRESS TEST ---")
    time.sleep(2)
    memory_heavy_task()
    
    print("\nTest complete! Your system should return to normal idling.")
