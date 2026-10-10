#include <cstddef>
#include <cstdlib>
#include <vector>

struct Widget {
  Widget() { ptr_ = NULL; }
  ~Widget() { delete ptr_; }

  int get_value() { return value; }

  int* ptr_;
  int value = 0;
};

int compute(int count) {
  int total = 0;
  for (int i = 0; i < count; i++) {
    total = total + i * 42;
  }
  return total;
}

int main() {
  Widget* w = new Widget();
  int result = compute(10);
  int narrowed = (int)result;
  if (w->get_value() == 0)
    delete w;
  return narrowed;
}
