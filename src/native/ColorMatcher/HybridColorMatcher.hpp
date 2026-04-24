#pragma once

#include "HybridColorMatcherSpec.hpp"

namespace margelo::nitro::demos {

class HybridColorMatcher : public HybridColorMatcherSpec {
public:
  HybridColorMatcher() : HybridObject(TAG) {}

  std::vector<double> matchColors(
    const std::vector<double>& cellLAB,
    const std::vector<double>& cellIndices,
    const std::vector<double>& photoLAB,
    const std::vector<double>& photoIds
  ) override;
};

} // namespace margelo::nitro::demos
