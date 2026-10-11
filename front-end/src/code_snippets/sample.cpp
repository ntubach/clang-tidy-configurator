#include <cstddef>
#include <cstdlib>
#include <vector>

namespace app {
constexpr int kMaxWidgets = 100;
}

enum class Color { Red, Green, Blue };

struct Widget {
  Widget() { ptr_ = NULL; }
  ~Widget() { delete ptr_; }

  int get_value() { return value_; }

  int* ptr_;
  int value_ = 0;
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
  Color c = Color::Red;
  if (w->get_value() == 0 || narrowed > app::kMaxWidgets)
    delete w;
  return narrowed + static_cast<int>(c);
}
