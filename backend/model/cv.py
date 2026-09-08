#Tjis will be the modellll
import cv2
import torch
def test():
    img = cv2.imread("photo.png")
    print(img.shape, img.dtype)   # (height, width, 3) uint8
    device = "cuda" if torch.cuda.is_available() else ("mps" if torch.backends.mps.is_available() else "cpu")
    # model = model.to(device)
    # inputs = {k: v.to(device) for k, v in inputs.items()}
    print(device)