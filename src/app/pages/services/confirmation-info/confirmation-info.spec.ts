import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfirmationInfo } from './confirmation-info';

describe('ConfirmationInfo', () => {
  let component: ConfirmationInfo;
  let fixture: ComponentFixture<ConfirmationInfo>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmationInfo]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConfirmationInfo);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
